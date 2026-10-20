# Mon serveur : envoyer les données au site Pulse

Ce fork ajoute un réglage **Mon serveur** (Réglages › Mon serveur, ou Plus › Mon serveur). Appairé, le téléphone envoie
à votre propre serveur [Pulse](https://github.com/adityaongit/pulse) ce qu'il a lu dans Health Connect, après chaque
synchronisation. Le site reçoit alors les mêmes données que l'app, sans l'application Life Dashboard Companion.

```mermaid
flowchart LR
  F[Bracelet Fitbit] --> A[App Fitbit] --> HC[(Health Connect)]
  HC --> PM[Pulse Mobile<br/>SQLite, scores sur le téléphone]
  PM -- "POST JSON signé HMAC<br/>après chaque synchronisation" --> S[Pulse serveur<br/>/api/ingest/health-connect/…]
  S --> W[Site web, coach, dossier médical]
```

## Appairer

1. Sur le site, ouvrez **Settings › Data source** et tapez **Pair phone**. Un QR code s'affiche ; dessous, le lien du
   code (ou l'adresse `https://…/api/ingest/health-connect/…` et le secret).
2. Dans l'app, **Réglages › Mon serveur**, collez le lien du code (ou l'adresse puis le secret, sur deux lignes) et
   tapez **Appairer**. L'app envoie un ping signé ; le serveur répond « Paired, waiting for the first sync ».
3. Le premier envoi part avec la synchronisation suivante : tout l'historique que l'app possède (180 jours), par
   fenêtres de 7 jours. Ensuite, chaque synchronisation renvoie les 3 derniers jours plus les jours nouveaux.

Le serveur doit être en HTTPS. Une adresse en `http://` n'est acceptée que si vous cochez « Autoriser http:// »
(réseau local seulement).

## Ce qui est envoyé

Le contenu du Store de l'app, déjà dédupliqué et filtré par la politique de sources, au format que Pulse accepte déjà
pour Life Dashboard Companion : fréquence cardiaque, pas par minute, HRV, sessions de sommeil avec leurs stades,
exercices, et par jour la FC de repos, la fréquence respiratoire, la SpO2, la température cutanée (écart et base),
le poids, la masse grasse, la VO2max, les totaux du jour et la taille. Chaque fenêtre est déclarée complète : le
serveur retire ce qui n'est plus dans l'app (une nuit réécrite par Fitbit, par exemple).

Ne partent pas : le journal, les notes, les réglages, les scores. **Les scores ne sont pas partagés** : le téléphone
et le site calculent chacun les leurs avec leur moteur, et les deux peuvent différer légèrement pour une même nuit.

## Sécurité

- Le secret d'appairage est dans `expo-secure-store`, jamais dans AsyncStorage ni dans les logs.
- Chaque envoi est signé `X-Signature: sha256=HMAC-SHA256(secret, corps)` ; le serveur rejette le reste.
- Les corps ne sont jamais journalisés.

## Erreurs et reprise

L'envoi ne bloque jamais la synchronisation ni les scores : une erreur est un indice (`server_push_failed:<code>`)
affiché dans Mon serveur, et le prochain envoi reprend là où le précédent s'est arrêté (le numéro de séquence est
écrit avant chaque envoi, le dernier jour transmis après). Codes : `unreachable` (réseau), `rejected_signature`
(secret changé sur le site : appairer à nouveau), `unknown_endpoint` (téléphone dissocié sur le site), `too_large`
(limite du proxy : 12 Mo côté Pulse), `server_error`, `bad_response`.

**Dissocier** retire le secret du téléphone et cesse l'envoi ; rien n'est supprimé sur le serveur.

## Code

`src/push/` : `sign.ts` (HMAC, `@noble/hashes`), `pairing.ts` (lecture du code, stockage, état), `payload.ts`
(Store → corps JSON), `push.ts` (fenêtres, séquences, envoi, erreurs, `pushAfterSync`). Le point d'appel est
`src/background/runSync.ts`, après `runPipeline`. L'écran est `src/screens/settings/ServerSection.tsx`.
