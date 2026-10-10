package pulse.googleauth

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts.StartIntentSenderForResult
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Scope
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

/**
 * Google's Authorization API (play-services-auth `AuthorizationClient`): an access token for the requested scopes,
 * with no sign-in, no identity scopes, no refresh token and no client secret. Google matches the request to the
 * Android OAuth client by package name and signing certificate, so no client id is passed.
 *
 * `authorize(scopes, interactive)` resolves `{ accessToken, grantedScopes }`.
 * - Interactive: Google's own account chooser and "Select what Pulse can access" screens, launched from the consent
 *   PendingIntent through the Expo activity-result registry. Nothing opens a browser.
 * - Silent: the same call without UI. Play services answers from its cache or mints a fresh token; when the person
 *   has to consent again it rejects with ERR_CONSENT_REQUIRED instead of showing anything.
 *
 * Rejection codes: ERR_CANCELLED, ERR_CONSENT_REQUIRED, ERR_PLAY_SERVICES, ERR_NETWORK, ERR_MISCONFIGURED, ERR_FAILED.
 * Messages carry a status code at most, never a token.
 */
class GoogleAuthModule : Module() {
  private var consent: AppContextActivityResultLauncher<String, ConsentResult>? = null
  /** The consent PendingIntent the contract launches. Held here because a launcher's input must be Serializable. */
  private var pending: PendingIntent? = null

  override fun definition() = ModuleDefinition {
    Name("PulseGoogleAuth")

    RegisterActivityContracts {
      consent = registerForActivityResult(ConsentContract { pending })
    }

    AsyncFunction("authorize") Coroutine { scopes: List<String>, interactive: Boolean ->
      authorize(scopes, interactive)
    }

    // Drops a token from Play services' cache, so the next silent authorize mints a new one.
    AsyncFunction("clearToken") Coroutine { token: String ->
      val context = appContext.reactContext ?: return@Coroutine null
      try {
        Identity.getAuthorizationClient(context).clearToken(ClearTokenRequest.builder().setToken(token).build()).await()
      } catch (e: ApiException) {
        throw coded(e)
      }
      null
    }
  }

  private suspend fun authorize(scopes: List<String>, interactive: Boolean): Map<String, Any?> {
    val context: Context = (if (interactive) appContext.currentActivity else null) ?: appContext.reactContext
      ?: throw CodedException("ERR_FAILED", "No Android context", null)
    if (GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) != ConnectionResult.SUCCESS) {
      throw CodedException("ERR_PLAY_SERVICES", "Google Play services is missing or out of date", null)
    }
    val client = if (context is Activity) Identity.getAuthorizationClient(context) else Identity.getAuthorizationClient(context)
    val request = AuthorizationRequest.builder()
      .setRequestedScopes(scopes.map { Scope(it) })
      // A connect always shows the account chooser, so the person picks the account their Fitbit uses.
      .apply { if (interactive) setPrompt(AuthorizationRequest.Prompt.SELECT_ACCOUNT) }
      .build()

    var result: AuthorizationResult = try {
      client.authorize(request).await()
    } catch (e: ApiException) {
      throw coded(e)
    }
    if (result.hasResolution()) {
      if (!interactive) throw CodedException("ERR_CONSENT_REQUIRED", "Google needs consent again", null)
      val launcher = consent ?: throw CodedException("ERR_FAILED", "The consent launcher is not registered", null)
      pending = result.pendingIntent
      val answer = try {
        withContext(Dispatchers.Main) { launcher.launch("consent") }
      } finally {
        pending = null
      }
      if (answer.resultCode != Activity.RESULT_OK || answer.data == null) {
        throw CodedException("ERR_CANCELLED", "Consent was cancelled", null)
      }
      result = try {
        client.getAuthorizationResultFromIntent(answer.data)
      } catch (e: ApiException) {
        throw coded(e)
      }
    }
    val token = result.accessToken ?: throw CodedException("ERR_FAILED", "Google returned no access token", null)
    return mapOf("accessToken" to token, "grantedScopes" to result.grantedScopes)
  }

  private fun coded(e: ApiException): CodedException {
    val code = when (e.statusCode) {
      CommonStatusCodes.CANCELED -> "ERR_CANCELLED"
      CommonStatusCodes.NETWORK_ERROR, CommonStatusCodes.TIMEOUT -> "ERR_NETWORK"
      CommonStatusCodes.DEVELOPER_ERROR -> "ERR_MISCONFIGURED"
      CommonStatusCodes.SIGN_IN_REQUIRED, CommonStatusCodes.RESOLUTION_REQUIRED -> "ERR_CONSENT_REQUIRED"
      else -> "ERR_FAILED"
    }
    return CodedException(code, "Google authorization failed (status ${e.statusCode})", null)
  }
}

class ConsentResult(val resultCode: Int, val data: Intent?)

/** Launches the consent PendingIntent with startIntentSenderForResult (the registry's intent-sender path). */
private class ConsentContract(private val pending: () -> PendingIntent?) : AppContextActivityResultContract<String, ConsentResult> {
  override fun createIntent(context: Context, input: String): Intent {
    val intent = requireNotNull(pending()) { "No consent PendingIntent" }
    return Intent(StartIntentSenderForResult.ACTION_INTENT_SENDER_REQUEST)
      .putExtra(StartIntentSenderForResult.EXTRA_INTENT_SENDER_REQUEST, IntentSenderRequest.Builder(intent).build())
  }

  override fun parseResult(input: String, resultCode: Int, intent: Intent?) = ConsentResult(resultCode, intent)
}
