// "How Pulse works" (More): one explainer per score, written from src/core and docs/algorithms. Every number here
// is the code's; when the code changes, change this file.
export type HowRow = { term: string; detail: string }
export type HowSection = { title: string; paragraphs?: string[]; rows?: HowRow[] }
export type ScoreDoc = {
  /** URL segment: /more/how-it-works/<slug>. */
  slug: string
  /** Display name, e.g. "Recovery", "Pulse Age". */
  name: string
  /** One short sentence (max ~70 characters) shown as the page intro and as a caption. */
  summary: string
  /** The in-app screen where the score lives, e.g. "/recovery", "/health/healthspan"; null if none. */
  href: string | null
  /** In this order: "What goes in", "How it is weighted", "What the bands mean", optionally "A worked example" (real numbers run through the code), "Limits". Omit a section only if it truly does not apply (say so in Limits instead). */
  sections: HowSection[]
}
export const SCORE_DOCS: ScoreDoc[] = [
  {
    slug: "recovery",
    name: "Recovery",
    summary: "How ready your body is to take on strain today, from 0 to 100%.",
    href: "/recovery",
    sections: [
      {
        title: "What goes in",
        paragraphs: [
          "Pulse scores Recovery each morning from last night’s main sleep, comparing each vital with your own baseline: a running average of recent nights that leans on the last two weeks and clips extreme nights.",
        ],
        rows: [
          { term: "Heart rate variability", detail: "Fitbit’s nightly HRV, in ms. Higher is better." },
          { term: "Resting heart rate", detail: "Fitbit’s daily resting heart rate from Health Connect, in bpm; the lowest 5-minute average during sleep only on a day it has none. Lower is better." },
          { term: "Sleep performance", detail: "Last night’s Sleep Performance. 85% is neutral." },
          { term: "Respiratory rate", detail: "Breaths per minute asleep, in rpm. Higher counts against you." },
          { term: "Skin temperature", detail: "Distance from your skin-temperature baseline (your 30-night median), in °C. Either direction counts against you." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Each input is measured in units of your usual night-to-night swing from baseline. Sleep moves one unit per 12\u00a0points away from 85%, skin temperature one unit per 1\u00a0°C. A missing input’s weight is shared among the rest.",
        ],
        rows: [
          { term: "HRV", detail: "55%" },
          { term: "Resting heart rate", detail: "20%" },
          { term: "Sleep performance", detail: "15%" },
          { term: "Respiratory rate", detail: "5%" },
          { term: "Skin temperature", detail: "5%" },
        ],
      },
      {
        title: "What the bands mean",
        paragraphs: [
          "The weighted average goes through an S-shaped curve (slope 1.6). Every input at baseline lands at about 58%; a quarter of a swing above reaches green, 0.6 below drops into red.",
        ],
        rows: [
          { term: "67-100%", detail: "Green: your body is primed for strain." },
          { term: "34-66%", detail: "Yellow: you are maintaining; moderate strain fits." },
          { term: "0-33%", detail: "Red: your body needs rest." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Recovery needs 7\u00a0nights of HRV before the first score and is Provisional until 14. The other vitals join once each has 4\u00a0nights of baseline. A night Fitbit could not stage has no HRV, so it gets no score rather than a guess, and after more than 14\u00a0nights without HRV the first night back is not scored. Recovery is an estimate from a wrist sensor: it reads your body, not your plans or how you feel.",
        ],
      },
    ],
  },
  {
    slug: "strain",
    name: "Strain",
    summary: "The load of your day as a percent: 0 to 100 on most days, above 100 on a very big one.",
    href: "/strain",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Heart rate while awake", detail: "Minute averages outside sleep and recorded workouts. Each covers the gap to the next one, up to 30\u00a0minutes; minutes below Zone 1 are left out." },
          { term: "Workouts", detail: "Every heart-rate reading during a recorded workout, each covering the gap to the next one." },
          { term: "Steps", detail: "The steps you take while awake, outside workouts." },
          { term: "Max heart rate", detail: "The value in Settings; else 208 − 0.7 × your age. Zone 1 starts at 50% of it, then 60, 70, 80 and 90%." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Each second of heart rate earns units by its zone, rising smoothly across the zone: the harder your heart works, the faster units add up.",
        ],
        rows: [
          { term: "Below Zone 1", detail: "0 to 1 unit a second (workouts only)" },
          { term: "Zone 1", detail: "2 units a second" },
          { term: "Zone 2", detail: "3 to 4 units a second" },
          { term: "Zone 3", detail: "4 to 7 units a second" },
          { term: "Zone 4", detail: "7 to 12 units a second" },
          { term: "Zone 5", detail: "12 to 20 units a second" },
        ],
      },
      {
        title: "What the bands mean",
        paragraphs: [
          "Strain = 16 × atan(steps ÷ 7,000) + 66 × atan(units ÷ 20,000). Both parts flatten as they grow, so each point of Strain is harder to earn than the last. An hour in the middle of Zone 3 gives about 19,800 units, worth 52; add 8,000 steps and the day comes to 65. The most a day can reach is about 129.",
        ],
        rows: [
          { term: "Up to 40%", detail: "Light" },
          { term: "41-60%", detail: "Moderate" },
          { term: "61-79%", detail: "Strenuous" },
          { term: "80% and up", detail: "All out" },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Strain needs heart rate or steps for the day; otherwise the day shows Not enough data. Today’s Strain is a running total until midnight. Each activity also gets its own Strain from its units alone: 66 × atan(units ÷ 20,000).",
          "Heart rate misses effort that barely raises it, such as heavy lifting with long rests. The ring fills at 100% and stays full above it; the number shows the real value.",
        ],
      },
    ],
  },
  {
    slug: "strain-target",
    name: "Strain Target",
    summary: "A Strain range for today, set by your Recovery and your recent Strain.",
    href: "/strain",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Today’s Recovery", detail: "Moves and widens the range. Without a Recovery score Pulse reads it as 50%." },
          { term: "Your last 14\u00a0days of Strain", detail: "Folded into a base, the newest days counting most; a day without Strain counts as 0." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "The base starts at the oldest day and each day after moves it a quarter of the way to that day's Strain. Recovery then scales the base: at 50% it stays, at 100% it rises 30%, at 0% it drops 30%. The range runs from that centre minus 5 to 10 points, to the centre plus 10 to 30 points, wider with a higher Recovery. The low end stays between 20 and 120, the high end between 40 and 120.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Below the range", detail: "A lighter day than your body can take today." },
          { term: "Inside the range", detail: "Training builds fitness without digging a recovery hole." },
          { term: "Above the range", detail: "More strain than today’s Recovery suggests; expect it to show tomorrow." },
        ],
      },
      {
        title: "A worked example",
        paragraphs: [
          "Take 14 days of past Strain, oldest first: 45, 50, 20, 55, 48, 40, 60, 47, 52, 25, 50, 45, 55, 50. Today's own Strain is left out. Folded day by day, the base comes to 47.9.",
          "Today's Recovery is 72%, so the centre is 47.9 × 1.13 = 54.2. The range runs from 54.2 − 8.6 to 54.2 + 24.4: a target of 46 - 79%. With the same history and a Recovery of 30%, the centre drops to 42.2 and the target to 36 - 58%.",
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "With fewer than 14\u00a0days of Strain the base folds what there is, so the first weeks read as an estimate. The target does not know your training plan, races or injuries. It is a guide, not a prescription.",
        ],
      },
    ],
  },
  {
    slug: "sleep",
    name: "Sleep Performance",
    summary: "How well last night’s sleep met your need, from 0 to 100%.",
    href: "/sleep",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Hours asleep", detail: "Your main sleep against your sleep need. Naps are not counted here." },
          { term: "Sleep efficiency", detail: "Time asleep as a share of time in bed." },
          { term: "Restorative sleep", detail: "Deep and REM sleep as a share of time asleep." },
          { term: "Sleep consistency", detail: "Your Sleep Regularity over the last 7\u00a0days." },
        ],
        paragraphs: [
          "Your sleep need is the upper quartile of your last 28\u00a0nights, at least 8\u00a0hours (9 under 18) and at most 9.5. Until you have 7\u00a0nights, it is 8\u00a0hours.",
        ],
      },
      {
        title: "How it is weighted",
        rows: [
          { term: "Hours vs. need, 50%", detail: "Full marks at 100% of your need." },
          { term: "Efficiency, 20%", detail: "Scored as the percentage itself." },
          { term: "Restorative, 20%", detail: "Full marks when deep plus REM reach 50% of your sleep and deep alone reaches 13%. Less deep sleep scales this part down, to half at none." },
          { term: "Consistency, 10%", detail: "Scored as the consistency percentage." },
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "85-100%", detail: "Optimal" },
          { term: "70-84%", detail: "Sufficient" },
          { term: "0-69%", detail: "Poor" },
        ],
        paragraphs: [
          "The key statistics use their own marks for optimal and sufficient: hours vs. needed 85% and 70%, efficiency 85% and 75%, restorative 40% and 30%, consistency 80% and 70%.",
        ],
      },
      {
        title: "A worked example",
        paragraphs: [
          "Take someone whose last 28 nights run from 6.8 to 8.8 hours. The upper quartile of those nights is 8.2 hours, above the 8-hour floor, so their sleep need is 8.2 hours. Last night they slept 6 hours 45 minutes, spent 88% of their time in bed asleep, got 55 minutes of deep and 85 minutes of REM sleep, and their Sleep Regularity over the last 7 days is 88.9%.",
          "Hours come first: 6.75 against 8.2 is 82.3% of need, worth 50% of the score, so 41.2 points. Efficiency is scored as the percentage itself, 88, and counts 20%, so 17.6 points. Restorative sleep is deep plus REM, 140 minutes out of 405, or 34.6% of the night. Against the 50% target that is 69.1, and since deep sleep is 13.6% of the night, above the 13% mark, nothing is scaled down. At 20% weight, that is 13.8 points. Consistency counts 10%, so 88.9 gives 8.9 points.",
          "Add them up: 41.2 + 17.6 + 13.8 + 8.9 comes to 81.5, shown as 81%. That sits in the Sufficient band (70-84%), just short of Optimal. The weakest part is hours: another 30 minutes in bed would have added about 3 points. The figures come from running Pulse's own scoring code on these inputs.",
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Sleep Performance scores the main sleep only, once Fitbit has processed it. A night without deep and REM totals scores its restorative part as zero, so it reads lower. Without a consistency reading, that part counts as 50%. Sleep stages come from a wrist sensor and are an estimate.",
        ],
      },
    ],
  },
  {
    slug: "sleep-planner",
    name: "Sleep Planner",
    summary: "Tonight’s sleep need, and the bedtimes that meet it.",
    href: "/sleep",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Your sleep need", detail: "The upper quartile of your last 28\u00a0nights, between 8 and 9.5\u00a0hours." },
          { term: "Today’s Strain", detail: "Strain above your 28-day average adds to the need." },
          { term: "Sleep debt", detail: "What you owe from recent nights." },
          { term: "Naps", detail: "Today’s naps take time off tonight’s need." },
          { term: "Your last 14 main sleeps", detail: "Your usual wake time and sleep efficiency." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Tonight’s need = your sleep need + 3\u00a0minutes for each Strain point above your 28-day average + 20% of your sleep debt − today’s nap time.",
          "Sleep debt runs over your last 14\u00a0nights with sleep. Each night, debt becomes 55% of (need + the debt so far − sleep), with the previous day’s naps counted as sleep; anything under 10\u00a0minutes clears to zero.",
          "Bedtimes count back from your median wake time on recent weekday or weekend mornings, to match tomorrow, allowing for your median efficiency (90% until known). A need of 8\u00a0hours, a 07:00 wake and 90% efficiency give a Peak bedtime of 22:07.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Peak", detail: "100% of tonight’s need." },
          { term: "Perform", detail: "85% of tonight’s need." },
          { term: "Get by", detail: "70% of tonight’s need." },
        ],
      },
      {
        title: "A worked example",
        paragraphs: [
          "Take someone with a sleep need of 8 hours, which is 480 minutes. Today's Strain is 12.6 against a 28-day average of 9.45, so they are 3.15 points above their norm. Their sleep debt this morning is 60 minutes, they took a 20-minute nap, and tomorrow is a weekday. Over their last 14 main sleeps they have typically woken at 07:00 with 90% efficiency.",
          "Tonight's need starts from the 480 minutes. Strain adds 3 minutes for each point above average: 3.15 points gives 9.45 minutes. Debt adds 20%, so 60 minutes of debt gives 12. The nap takes off 20. That makes 480 + 9.45 + 12 - 20 = 481.45 minutes, about 8 hours 1 minute.",
          "Bedtimes then count back from 07:00. Because efficiency is 90%, time in bed is the sleep divided by 0.9. For Peak, 481.45 minutes of sleep needs 534.9 minutes in bed, so lights out at 22:05. Perform (85%) needs 454.7 minutes in bed, giving 23:25, and Get by (70%) needs 374.5 minutes, giving 00:45. These come from running Pulse's own sleep planner on those inputs. A harder day, more debt or a lower efficiency would all move the bedtimes earlier.",
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "The planner needs 7 main sleeps before it gives bedtimes. It assumes tomorrow looks like your recent mornings and cannot see alarms or plans. Strain and naps later today change tonight’s need. It is a guide, not a prescription.",
        ],
      },
    ],
  },
  {
    slug: "pulse-age",
    name: "Pulse Age",
    summary: "How old your body behaves, and how fast that is changing.",
    href: "/health/healthspan",
    sections: [
      {
        title: "What goes in",
        paragraphs: ["Nine habits and vitals, averaged over 6\u00a0months, each against a reference: a fit person of your age and sex."],
        rows: [
          { term: "VO2 max", detail: "From runs in the last 90\u00a0days, else Fitbit’s daily estimate at half weight. Reference: your age’s 75th percentile." },
          { term: "Resting heart rate", detail: "Fitbit’s daily value from Health Connect. Reference 60\u00a0bpm." },
          { term: "Steps", detail: "Reference and cap: 10,000 a day under 60, 8,000 from 60." },
          { term: "Sleep hours", detail: "Reference 7.5\u00a0hours; 7 to 8\u00a0scores the same." },
          { term: "Sleep consistency", detail: "Reference 86.3." },
          { term: "Heart rate zones 1-3", detail: "Daily time at 50-80% of your heart-rate reserve. Reference 150\u00a0minutes a week." },
          { term: "Heart rate zones 4-5", detail: "Daily time at 80% of your heart-rate reserve and above. Reference 75\u00a0minutes a week." },
          { term: "Strength activity", detail: "Reference 40\u00a0minutes a week." },
          { term: "Lean body mass", detail: "Fat-free mass for your height. Needs weight, body fat and height." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Each input maps to a change in mortality risk from a published study. The changes are added, shrunk by 25% for overlap, scaled up when inputs are missing, and turned into years on the rule that mortality risk doubles about every 8\u00a0years. A resting heart rate of 70\u00a0bpm, all else at reference, adds about 0.75\u00a0years.",
          "Pace of Aging repeats this for your last 30\u00a0days: 1 + (30-day years − 6-month years) ÷ 5.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Younger than your age", detail: "Your inputs beat the reference on balance." },
          { term: "Older than your age", detail: "They fall short. The reference is fit, so many people start here." },
          { term: "Pace below 1.0x", detail: "Your last 30\u00a0days look younger than your 6\u00a0months." },
          { term: "Pace above 1.0x", detail: "They look older. Pace runs from −1.0x to 3.0x." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Time in zones is counted by Pulse from your heart rate, on the same five zones as Strain. Pulse Age needs 5 of the 9 inputs, is Provisional until 20\u00a0days have data, stays within 15\u00a0years of your age and updates weekly. Pace of Aging is provisional until your data spans 6\u00a0months. Both rest on population studies, not a clinical test of your body.",
        ],
      },
    ],
  },
  {
    slug: "stress",
    name: "Stress Monitor",
    summary: "How far your heart rate sits above your calm level, from 0 to 3.",
    href: "/health/stress",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Minute heart rate", detail: "The average heart rate of each minute." },
          { term: "Steps", detail: "Only still minutes count: no steps in that minute or the 2 either side." },
          { term: "Workouts and sleep", detail: "Minutes inside them are left out." },
          { term: "Your calm baseline", detail: "Your resting daytime heart rate, from earlier days." },
        ],
        paragraphs: [
          "Each day’s calm heart rate is the 10th percentile of its hourly averages between 06:00 and 22:00, using hours with at least 15 still minutes. It feeds the next day’s baseline.",
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Each still minute’s distance above your baseline is measured in your usual spread, never less than 3.76\u00a0bpm, and mapped onto 0 to 3 on an S-shaped curve. At your baseline it reads 0.3, 1.5 spreads above reads 1.5, and 3 spreads above reads 2.7. Today Pulse shows the latest scored minute; past days show the day’s average.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "0-0.9", detail: "Low: calm." },
          { term: "1.0-1.9", detail: "Medium: heart rate above your calm level." },
          { term: "2.0-3.0", detail: "High: well above your calm level while you are still." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Stress is Provisional until 4\u00a0days have set your baseline; until then it uses a fixed spread of 7.65\u00a0bpm, so 15\u00a0bpm above your calm level reads 2.0. It reads heart rate alone, so caffeine, heat, illness or recovering from exercise raise it too. It is not a measure of how you feel.",
        ],
      },
    ],
  },
  {
    slug: "energy-bank",
    name: "Energy Bank",
    summary: "An estimate of how much energy you have left today, 0 to 100%.",
    href: "/",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Recovery and Sleep Performance", detail: "Set the starting level when you wake." },
          { term: "Heart-rate load", detail: "Each minute’s heart-rate points, as in Strain." },
          { term: "Stress", detail: "High-stress minutes drain; calm, still minutes recharge." },
          { term: "Naps", detail: "Recharge." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: ["At wake you start at 60% of Recovery plus 40% of Sleep Performance: Recovery 70% and sleep 80% start you at 74%. Then, minute by minute until bedtime:"],
        rows: [
          { term: "Awake", detail: "−0.04 a minute, about 38 over 16\u00a0hours." },
          { term: "Heart-rate load", detail: "−0.08 a minute for each heart-rate point, 1 to 5. An hour at 70-79% of your reserve costs 14.4." },
          { term: "High stress", detail: "−0.08 a minute." },
          { term: "Low stress, still", detail: "+0.01 a minute." },
          { term: "Napping", detail: "+0.25 a minute, with no drain." },
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "67-100%", detail: "Plenty in reserve." },
          { term: "34-66%", detail: "Pace yourself." },
          { term: "0-33%", detail: "Running low." },
        ],
        paragraphs: ["The level stays between 0 and 100%. The three biggest drains are listed by name."],
      },
      {
        title: "Limits",
        paragraphs: [
          "Energy Bank needs today’s Recovery and last night’s main sleep; without them it shows no value, and it is Provisional while Recovery is. It is a model with tuned constants and no published validation, set so a typical day ends between 15% and 40%. It cannot see mental effort that leaves heart rate unchanged, food or caffeine. It is an estimate, not a measurement.",
        ],
      },
    ],
  },
  {
    slug: "health-monitor",
    name: "Health Monitor",
    summary: "Last night’s five vitals against your own normal ranges.",
    href: "/health/monitor",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Resting heart rate", detail: "Fitbit’s daily resting heart rate from Health Connect, in bpm." },
          { term: "Heart rate variability", detail: "Fitbit’s nightly HRV, in ms." },
          { term: "Respiratory rate", detail: "Breaths per minute asleep, in rpm." },
          { term: "SpO2", detail: "Blood oxygen overnight, in %." },
          { term: "Skin temperature", detail: "Last night against your skin-temperature baseline, in °C." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "For every vital, a normal range is your baseline ± 2 of your usual night-to-night swings, built from earlier nights only. Pulse’s narrowest ranges are about ±5\u00a0bpm, ±12.5\u00a0ms, ±1.25\u00a0rpm, ±1.25\u00a0points of SpO2 and ±0.75\u00a0°C. SpO2 is one-sided: below 95% is always low, and a high value is never flagged.",
          "The illness signal compares resting heart rate, HRV, skin temperature and respiratory rate with your 30\u00a0nights before. A vital fires at 2 standard deviations in the unwell direction and adds 22\u00a0points per extra deviation, up to 40. With at least 2 vitals firing, 25\u00a0points is mild and 50 is raised. If you logged alcohol, sauna or travel the day before, Pulse takes that as the likely cause instead.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Within range", detail: "Inside your normal range." },
          { term: "Elevated or Low", detail: "Outside it; the chip names the bound you crossed." },
          { term: "Below 95%", detail: "SpO2 under 95%, whatever your range." },
          { term: "Illness signal", detail: "Several vitals moved together, a pattern often seen early in illness." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "A range needs 4 earlier nights and lapses after 14\u00a0nights without a value; skin temperature needs its own baseline first, so it takes about 8\u00a0nights. The illness signal stays quiet until 14 of your last 30\u00a0nights have resting heart rate or HRV. A flagged vital is a prompt to notice, not a diagnosis.",
        ],
      },
    ],
  },
  {
    slug: "fitness",
    name: "Fitness level",
    summary: "Your VO2 max compared with people of your age and sex.",
    href: "/health/fitness",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "VO2 max", detail: "Your latest run value from the last 90\u00a0days; otherwise Fitbit’s latest daily estimate, marked Provisional." },
          { term: "Age and sex", detail: "From your profile." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Pulse places your VO2 max in the FRIEND reference table (Kaminsky 2015): lab treadmill tests from 7,783 adults without heart disease, by sex and age decade. It reads between the published percentiles and keeps the result between the 5th and the 95th. Under 20 uses the 20-29 row; 80 and over uses 70-79. A man of 35 at 45.0\u00a0ml/kg/min sits just under the 60th percentile: Good.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "80th percentile and up", detail: "Superior" },
          { term: "60th-79th", detail: "Excellent" },
          { term: "40th-59th", detail: "Good" },
          { term: "20th-39th", detail: "Fair" },
          { term: "Below the 20th", detail: "Poor" },
        ],
      },
      {
        title: "A worked example",
        paragraphs: [
          "Take a woman of 52 whose Fitbit reports a VO2 max of 30 ml/kg/min from a recent run. Pulse picks the FRIEND treadmill row for women aged 50 to 59. That row reads 27.6 at the 75th percentile and 32.0 at the 90th.",
          "Her 30 sits between those two columns. Pulse reads linearly between them: it is 2.4 above the 75th-percentile value, out of a 4.4 gap, and the gap spans 15 percentile points. So the percentile is 75 plus 15 times 2.4 divided by 4.4, which is 83.2. Pulse shows it as the 83rd percentile.",
          "The bands are cut at the 20th, 40th, 60th and 80th percentiles, so 83.2 lands in Superior. Running Pulse's fitness level function on 30, age 52 and female returns exactly that.",
          "For comparison, a man of 35 with a VO2 max of 45 sits between the 50th and 75th columns of his row (42.4 and 49.2). That gives 59.6, just under the 60 cut-off, so he is Good rather than Excellent. The same VO2 max is a different percentile at a different age or sex, which is the point of the table. A value below the 5th-percentile column is shown as 5 and one above the 95th as 95, because the table does not resolve the tails.",
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Fitbit’s VO2 max is an estimate, while the table is lab-measured, so treat the percentile as approximate. The 2015 table runs 1.5-4.6\u00a0ml/kg/min higher than its 2022 update, so you may place a little low. The same table’s 75th percentile is the VO2 max reference in Pulse Age.",
        ],
      },
    ],
  },
  {
    slug: "training-balance",
    name: "Training balance",
    summary: "Whether your recent strain is above or below what you are used to.",
    href: "/health/fitness",
    sections: [
      {
        title: "What goes in",
        paragraphs: [
          "Your daily Strain. A day with the band worn but too little heart rate counts as 0; a day without the band is skipped. Today’s Strain so far counts toward today’s ratio.",
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Training load (ACWR) is your average Strain over the last 7\u00a0days with data, divided by your average over the last 28. 1.00 means this week matches your usual. Reports use the last day of the week or month that has a ratio; Fitness shows today’s.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Below 0.80", detail: "Undertrained (Detraining on Fitness): load dropped below your usual." },
          { term: "0.80-1.29", detail: "Balanced (Optimal): the usual sweet spot." },
          { term: "1.30-1.49", detail: "Overreaching (Pushing): load is rising faster than you are used to." },
          { term: "1.50 and up", detail: "Overreaching (High risk): load jumped well above your usual." },
        ],
      },
      {
        title: "A worked example",
        paragraphs: [
          "Take 28 days of Strain, oldest first: 40, 48, 0, 52, 44, 36, 56, then 44, 48, 0, 48, 40, 52, 48, then 40, 52, 0, 44, 48, 56, 36, and finally 48, 60, 52, 0, 64, 56, 60. The zeros are rest days with the band on, so they count.",
          "The last 7 days average 48.57 Strain. That is the acute load. All 28 days average 41.86, the chronic load. Training load, the acute to chronic workload ratio (ACWR), is 48.57 / 41.86 = 1.16.",
          "Pulse reads that against its bands: below 0.80 is Undertrained, 0.80 to 1.29 is Balanced, 1.30 to 1.49 is Pushing and 1.50 and up is High risk. At 1.16 this person is Balanced: the last week is a little heavier than usual, which is normal progression.",
          "The same week with a ratio of 1.45 would read Pushing, even though the daily numbers might not feel different. That is the point of the ratio: it compares you with yourself, not with anyone else's load.",
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Training load needs 14\u00a0days of Strain; until there are 28, your usual is the average of the days you have. It compares you with yourself, so it says nothing about whether your usual load suits your goals. The 0.8-1.3 sweet spot comes from team-sport injury research (Gabbett 2016) and is a rule of thumb.",
        ],
      },
    ],
  },
  {
    slug: "journal-impact",
    name: "Behaviour insights",
    summary: "How each behaviour you log goes with your next day’s scores.",
    href: "/journal/insights",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Journal check-ins", detail: "Each behaviour you answered yes or no, over the last 90\u00a0days." },
          { term: "Next-day scores", detail: "The next morning’s Recovery and HRV, and that night’s Sleep Performance." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "For each behaviour, Pulse compares the days you answered yes with the days you answered no: the difference in average next-day score. HRV shows as the change in standard deviations from your baseline. To see how sure that difference is, Pulse resamples your days 1,000 times and keeps the middle 90% of the results.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Positive or negative", detail: "That whole 90% range sits above or below zero: a clear effect." },
          { term: "No clear effect", detail: "The range crosses zero." },
          { term: "Needs more data", detail: "Fewer than 5 yes days or 5 no days." },
        ],
      },
      {
        title: "A worked example",
        paragraphs: [
          "Say someone logs alcohol for a month. Over 29 days they answer yes on 8 and no on 21. Pulse pairs each answer with the next morning's Recovery, because the question is what the day after looks like.",
          "On the 21 no days, next-morning Recovery averages higher than after the 8 yes days. The difference of the two averages, yes minus no, comes out at minus 11.6 points: on the day after alcohol, Recovery was about 12 points lower.",
          "That difference alone could be luck, so Pulse resamples. It redraws 8 yes days and 21 no days with replacement, takes the difference again, repeats 1,000 times, and keeps the middle 90% of the results. For this data the range runs from minus 14.7 to minus 8.4.",
          "The whole range sits below zero, so the label is Negative, a clear effect. Had the range run from, say, minus 4 to plus 6, the label would be No clear effect. Had there been only 4 yes days, Pulse would say Needs more data, because it needs at least 5 yes and 5 no days. These figures come from running Pulse's behaviour insights function on 29 check-ins and 30 daily Recovery scores. It shows an association, not proof of cause.",
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "This is an association, not proof of cause. It does not adjust for other behaviours or training, so a tag you tend to log on hard days can look harmful. About 1 in 10 behaviours with no real effect will still show a clear one by chance. Days without an answer are left out.",
        ],
      },
    ],
  },
  {
    slug: "sleep-consistency",
    name: "Sleep consistency",
    summary: "How closely your sleep and wake times repeat from day to day.",
    href: "/sleep",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Sleep sessions", detail: "Main sleeps and naps, minute by minute." },
          { term: "Band wear", detail: "A day counts only if the band recorded heart rate for at least half of it." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Pulse splits the last 7 noon-to-noon days into minutes, each asleep or awake, and checks each minute against the same minute the next day. The Sleep Regularity Index (Phillips 2017) is −100 + 200 × the share that match: 100 means an identical schedule, around 0 a random one. Pulse shows it from 0 to 100%, with anything below zero as 0%. A 1-hour nap lowers it by about 3\u00a0points.",
          "It makes up 10% of Sleep Performance and is one of the inputs to Pulse Age.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "80-100%", detail: "Optimal" },
          { term: "70-79%", detail: "Sufficient" },
          { term: "0-69%", detail: "Poor" },
        ],
      },
      {
        title: "A worked example",
        paragraphs: [
          "Take a week where someone sleeps 23:00 to 07:00 every night, except Friday and Saturday, when they go to bed at 01:00 and sleep until 09:00. Pulse splits the seven noon-to-noon days into 1,440 minutes each and marks every minute asleep or awake. It then compares each minute with the same minute 24 hours later, across six day-to-day pairs, 8,640 minutes in all.",
          "A normal night followed by a late one mismatches for four hours: the person was asleep 23:00 to 01:00 on the first day but awake, and asleep 07:00 to 09:00 on the second but awake the day before. The late Saturday-to-Sunday step costs another four hours. Friday to Saturday matches perfectly, since both nights are late. That is 8 hours, or 480 minutes, of mismatch, so 8,160 of 8,640 minutes match, or 94.4%.",
          "The index is -100 + 200 × 0.944, which is 88.9. Pulse shows that as 89%, which is Optimal (80-100%). Running Pulse's own regularity function on these sleep times gives the same figure. Two nights two hours late cost 11 points even with identical total sleep, which shows that the score rewards timing, not duration. A single one-hour nap would cost about 3 points more.",
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "It needs 2 worn days in a row within the window; otherwise there is no value. Days without the band are skipped rather than counted as awake. Fitbit’s sleep sessions leave out brief wakes, so this reads somewhat higher than a lab measure. On the night the clocks change, times are compared 1\u00a0hour apart.",
        ],
      },
    ],
  },
  {
    slug: "training-load",
    name: "Fitness, fatigue and form",
    summary: "Your long-term and short-term training load, and the gap between them.",
    href: "/health/fitness",
    sections: [
      {
        title: "What goes in",
        paragraphs: [
          "Cardio Load: each day's training impulse (TRIMP), summed over its recorded workouts from their heart rate against your 60-day resting baseline. A day without a workout counts as 0.",
        ],
      },
      {
        title: "How it is weighted",
        rows: [
          { term: "Fitness", detail: "Each day keeps 41/43 of yesterday's value and adds 2/43 of the day's load: about a three-week average." },
          { term: "Fatigue", detail: "Each day keeps 3/4 of yesterday's value and adds 1/4 of the day's load: about a week." },
          { term: "Form", detail: "Fitness minus Fatigue." },
        ],
        paragraphs: ["Both start from zero."],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Form above 0", detail: "Your recent load is lighter than your longer-term load: you are fresher." },
          { term: "Form below 0", detail: "You are carrying fatigue from recent training." },
        ],
      },
      {
        title: "A worked example",
        paragraphs: [
          "Take 14 days of daily load: 30, 45, 0, 50, 40, 35, 55, then 45, 60, 0, 50, 55, 40, 65. The zeros are rest days.",
          "Fatigue moves a quarter of the way to each day's load, so it ends at 47.0 after the 65 on day 14. Fitness moves 2/43 of the way, so it has only reached 20.4. Form is Fitness minus Fatigue: 20.4 - 47.0 = -26.6.",
          "A negative Form means recent load is heavier than the longer-term average. Fitness only settles after several weeks, so read the first few weeks as a rough guide.",
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Heart rate is its only input, so load that barely raises heart rate is missed. Until you have trained regularly for a few weeks the status shows as calibrating.",
        ],
      },
    ],
  },
  {
    slug: "hr-recovery",
    name: "Heart rate recovery",
    summary: "How far your heart rate drops within 2 minutes as a workout ends.",
    href: null,
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Heart rate", detail: "Every reading from the start of the workout to 2\u00a0minutes after it ends." },
          { term: "Zones", detail: "Your zones on max heart rate: zone 4 starts at 80%." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Heart rate recovery = the largest drop between two readings at most 2\u00a0minutes apart, where the first is taken before the workout ends, in bpm. It is measured only when the workout reached zone 4.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "20\u00a0bpm or more", detail: "Good" },
          { term: "12-19 bpm", detail: "Typical" },
          { term: "Below 12\u00a0bpm", detail: "Low" },
        ],
      },
      {
        title: "A worked example",
        paragraphs: [
          "Take a 36-year-old finishing a steady run. Pulse's default max heart rate for that age is about 183 bpm, so zone 4 starts at 147 bpm. The run reaches 174 bpm, so the workout counts.",
          "Pulse looks at every pair of readings at most 2 minutes apart whose first reading falls before the end. The highest early reading is 174 bpm in the final sprint; the lowest within 2 minutes of it is 149 bpm.",
          "Heart rate recovery is 174 minus 149, so 25 bpm. That is 20 or more, which Pulse calls Good. If the runner had kept jogging and the lowest reading had been 160, the drop would be 14 bpm, which is Typical. A workout that never reaches zone 4 shows Not enough heart-rate data instead of a guess.",
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "It needs dense heart rate around the end of the activity, which Fitbit does not always record; otherwise it shows Not enough heart-rate data. Moving about in those 2 minutes, or stopping the activity late, lowers the drop. Compare it across similar workouts, not between different sports.",
        ],
      },
    ],
  },
  {
    slug: "hrv-status",
    name: "HRV Status",
    summary: "Your 7-day HRV against your usual range, in Garmin’s manner.",
    href: "/health",
    sections: [
      {
        title: "What goes in",
        paragraphs: ["Fitbit’s nightly HRV (RMSSD, in ms), one value a night."],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Pulse averages the natural log of your HRV over the last 7\u00a0nights (it needs 4 of them) and compares it with the mean and spread of the 60\u00a0nights before. Your usual range is the mean ± 0.75 of a spread; the Low line is 1.5 spreads under the mean. The log scale is the one HRV research uses, so a night twice your usual counts as much above as half your usual counts below.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Balanced", detail: "Your 7-day average is in your usual range." },
          { term: "Unbalanced", detail: "Above your usual range, or a little below it." },
          { term: "Low", detail: "Well below your usual range: often strain, illness or poor sleep." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "It needs 21\u00a0nights of HRV first. Garmin reads HRV across the whole night from its own sensor and adds a Poor status when your range is low for your age; Pulse uses Fitbit’s nightly value and leaves Poor out until it has a published age norm. The spread and the 0.75 and 1.5 lines are Pulse’s choices: Garmin doesn’t publish its own. This is Pulse’s implementation of Garmin’s published idea, not Garmin’s number.",
        ],
      },
    ],
  },
  {
    slug: "training-readiness",
    name: "Training Readiness",
    summary: "How ready you are for hard training today, from 1 to 100.",
    href: "/strain",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Last night’s sleep", detail: "Sleep Performance." },
          { term: "Recovery time", detail: "Hours left before your next hard session (below)." },
          { term: "HRV Status", detail: "Balanced, Unbalanced above or below, or Low." },
          { term: "Load ratio", detail: "Garmin’s acute against chronic load." },
          { term: "Sleep history", detail: "Sleep Performance over the last 3\u00a0nights." },
          { term: "Stress history", detail: "Your average awake stress over the last 3\u00a0days." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Each factor is scored 0 to 100: recovery time as 100 × (1 − hours ÷ 72)^1.3; HRV Balanced 100, Unbalanced above 75, below 55, Low 25; load ratio 100 from 0.8 to 1.5, falling to 30 at 2.0, and 90 under 0.8; stress 100 less 50 for each point of average stress above 0.75.",
          "Readiness = 25% sleep + 25% recovery time + 15% HRV + 15% load + 10% sleep history + 10% stress history, a missing factor’s weight shared among the rest. It is never more than the weakest factor + 30, and a day of more than 18\u00a0hours awake before last night’s sleep takes 10 off.",
          "Recovery time: each workout adds 72 × ((Training Effect − 1) ÷ 4)^2.32 hours (about 24 at 3.5, 72 at 5); on top of time left, the larger plus a quarter of the smaller, up to 96, and 15% more with a load ratio of 1.5 or more. It counts down an hour an hour, 1.4 asleep after a night of 85% or better, 0.7 in a stressed hour or after a night under 70%.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "95-100", detail: "Prime" },
          { term: "75-94", detail: "High" },
          { term: "50-74", detail: "Moderate" },
          { term: "25-49", detail: "Low" },
          { term: "1-24", detail: "Poor" },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Garmin publishes the factors, that sleep and recovery time count most, and the bands; it doesn’t publish weights or recovery-time constants, so these are Pulse’s, fitted to Garmin’s published recovery-time table. It is set at wake and drops after training. It needs a scored night and three of its factors. It is a guide for today’s training, not a medical reading.",
        ],
      },
    ],
  },
  {
    slug: "training-effect",
    name: "Training Effect",
    summary: "How much a workout improves your aerobic fitness, from 0 to 5.",
    href: null,
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Heart rate in the workout", detail: "As a share of your heart-rate reserve, turned into a share of your VO2 max." },
          { term: "VO2 max", detail: "Fitbit’s or a measured one from the last 90\u00a0days; else Uth’s estimate, 15.3 × max ÷ resting heart rate." },
          { term: "Your training background", detail: "An activity class from 0 to 10: from your VO2 max, age, BMI and sex (Jackson 1990), or from your weekly workout hours over the last 4\u00a0weeks, whichever is higher." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Pulse estimates the workout’s EPOC, the extra oxygen your body uses afterwards to recover, second by second: it rises with intensity and fades when you ease off, on curves fitted to Firstbeat’s published figures (an hour at 70% of VO2 max is about 137\u00a0ml/kg). The peak is compared with the EPOC that makes each Training Effect level for your activity class (Firstbeat’s published lines), linearly between them.",
          "The main benefit comes from the effect and your time by share of max heart rate: Recovery under 2; VO2 max at 4 or more with over 10\u00a0minutes above 90%; Threshold when most of it was at 80% or more; Tempo when a quarter or more was; else Base.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "0-0.9", detail: "No benefit" },
          { term: "1.0-1.9", detail: "Minor" },
          { term: "2.0-2.9", detail: "Maintaining" },
          { term: "3.0-3.9", detail: "Improving" },
          { term: "4.0-4.9", detail: "Highly improving" },
          { term: "5.0", detail: "Overreaching" },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "Garmin estimates EPOC with beat-to-beat data and unpublished constants; Pulse’s comes from heart rate alone, so read it as an estimate. There is no anaerobic Training Effect, which needs pace or power. A workout without enough heart rate has none. This is Pulse’s implementation of Garmin’s published method, not Garmin’s number.",
        ],
      },
    ],
  },
  {
    slug: "training-status",
    name: "Training Status",
    summary: "What your recent training is doing to your fitness.",
    href: "/strain",
    sections: [
      {
        title: "What goes in",
        rows: [
          { term: "Load ratio", detail: "Garmin’s acute against chronic load, and whether the acute load is falling (under 90% of a week ago)." },
          { term: "VO2 max trend", detail: "Fitbit’s VO2 max over the last 28\u00a0days, recent days weighted more, as a change a month." },
          { term: "HRV Status", detail: "Today’s, and the last 3\u00a0days’." },
        ],
      },
      {
        title: "How it is weighted",
        paragraphs: [
          "Rules, in order, the first that fits: Detraining, acute load under 20% of your 12-week median for 7\u00a0days; Strained, HRV Low, or Unbalanced below for 3\u00a0days, at a ratio of 0.8 or more; Overreaching, a ratio of 1.5 or more with VO2 max falling 1.5 a month or more or HRV Low; Recovery, a ratio under 0.8 and load falling; Peaking, VO2 max rising 1.5 a month or more while load falls; Productive, a ratio from 0.8 to 1.5 with VO2 max rising, or HRV Balanced at 1.0 or more; Unproductive, that ratio with VO2 max falling; otherwise Maintaining.",
        ],
      },
      {
        title: "What the bands mean",
        rows: [
          { term: "Productive, Peaking", detail: "Training is paying off." },
          { term: "Maintaining, Recovery", detail: "Holding fitness, or recovering for more." },
          { term: "Unproductive, Strained, Detraining", detail: "Something is off: recovery, or too little load." },
          { term: "Overreaching", detail: "Load is high enough to cost you. Ease off." },
        ],
      },
      {
        title: "Limits",
        paragraphs: [
          "It needs about 3\u00a0weeks of training data and a VO2 max or an HRV Status. Fitbit’s VO2 max is an estimate that moves slowly, so Pulse reads its trend over 28\u00a0days rather than Garmin’s 14. Garmin’s Paused status (time off for illness or injury) isn’t detected. This is Pulse’s implementation of the rules in Firstbeat’s published patent, not Garmin’s number.",
        ],
      },
    ],
  },
]
