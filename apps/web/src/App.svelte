<script lang="ts">
  import { onMount } from 'svelte';
  import { createAuthClient } from 'better-auth/client';

  type Route = 'home' | 'privacy' | 'support' | 'changelog' | 'about' | 'guides' | 'terms' | 'reset-password';

  const routes: Record<string, Route> = {
    '/': 'home',
    '/privacy': 'privacy',
    '/support': 'support',
    '/changelog': 'changelog',
    '/reset-password': 'reset-password',
    '/about': 'about',
    '/guides': 'guides',
    '/terms': 'terms',
  };

  const authClient = createAuthClient({
    baseURL: import.meta.env.VITE_CONVEX_SITE_URL as string,
  });

  let theme: 'light' | 'dark' = 'light';
  let route: Route = typeof window === 'undefined' ? 'home' : routeFromPath(window.location.pathname);
  let newPassword = '';
  let resetMessage = '';
  let resetError = '';
  let appOpenMessage = '';
  let appOpenTimer = 0;

  function routeFromPath(path: string): Route {
    return routes[path] ?? 'home';
  }

  function setTheme(next: 'light' | 'dark') {
    theme = next;
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
  }

  async function submitResetPassword(event: SubmitEvent) {
    event.preventDefault();
    resetError = '';
    resetMessage = '';
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      resetError = 'This reset link is missing its token. Request a new one from the app.';
      return;
    }
    const { error } = await authClient.resetPassword({ token, newPassword });
    if (error) {
      resetError = error.message ?? 'Could not reset password';
      return;
    }
    resetMessage = 'Password changed. Open the app and sign in.';
    newPassword = '';
  }

  function go(event: MouseEvent, path: string) {
    event.preventDefault();
    history.pushState(null, '', path);
    route = routeFromPath(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openApp(event: MouseEvent) {
    event.preventDefault();
    appOpenMessage = 'Trying to open OneRep…';
    window.location.href = 'https://app.onerep.life';
    window.clearTimeout(appOpenTimer);
    appOpenTimer = window.setTimeout(() => {
      if (document.visibilityState === 'visible') {
        appOpenMessage = 'If nothing opened, go to app.onerep.life in this browser or add it to your home screen.';
      }
    }, 1200);
  }

  onMount(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    setTheme(saved ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

    if (window.location.pathname === '/download') {
      history.replaceState(null, '', '/');
      route = 'home';
    }

    const onPop = () => {
      route = routeFromPath(window.location.pathname);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        window.clearTimeout(appOpenTimer);
        appOpenMessage = '';
      }
    };
    window.addEventListener('popstate', onPop);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearTimeout(appOpenTimer);
    };
  });

  const receipt = [
    { time: '7:12 AM', title: 'Greek yogurt bowl', meta: '420 kcal · 28g protein' },
    { time: '12:41 PM', title: 'Push day started', meta: 'Bench, incline, triceps' },
    { time: '6:03 PM', title: 'Water logged', meta: '2.0 L / 2.5 L goal' },
    { time: 'Sunday', title: 'Progress photo added', meta: 'Weight, waist, and notes saved' },
  ];

  const signals = ['workouts', 'foods', 'water', 'macros', 'recipes', 'routines', 'measurements', 'photos', 'offline sync', 'export'];

  const principles = [
    {
      title: 'Simplicity by design',
      text: 'Built around the actions in the app: log the day, adjust the routine, close it, and come back later.',
    },
    {
      title: 'Privacy first',
      text: 'Your meals, weight, body photos, and workouts are yours. There is no public feed, and Settings includes analytics controls, export, and deletion.',
    },
    {
      title: 'No fake hype',
      text: 'OneRep records workouts, food, water, and check-ins. It does not pretend a public leaderboard or cartoon trophy is the product.',
    },
  ];

  const details = [
    {
      title: 'Lift',
      image: '/placeholders/workout-tile.svg',
      intro: 'Build presets, place them on weekdays, and keep an active workout open while you train.',
      bullets: ['Create workout presets', 'Assign routines to weekdays', 'Track weight, reps, sets, and rest', 'Use strength, cardio, or mobility focus'],
    },
    {
      title: 'Eat',
      image: '/placeholders/food-tile.svg',
      intro: 'A food diary for meals, recipes, and packaged foods.',
      bullets: ['Search foods by name', 'Scan barcodes', 'Build recipes from ingredients', 'Track calories, protein, carbs, and fat'],
    },
    {
      title: 'Check in',
      image: '/placeholders/progress-tile.svg',
      intro: 'A progress log for measurements, photos, notes, and trends.',
      bullets: ['Track weight, body fat, waist, hips, and chest', 'Add arms, thighs, calves, neck, notes, and photos', 'Review weight, body fat, and circumference trends', 'Keep a dated check-in ledger'],
    },
  ];

  const workflow = [
    {
      step: '01',
      title: 'Start with today',
      text: 'Open the app, finish onboarding, and use the dashboard for the day you are actually logging.',
    },
    {
      step: '02',
      title: 'Log the basics',
      text: 'Add the workout, meal, water, and check-in data that happened. No social feed. No performance theater.',
    },
    {
      step: '03',
      title: 'Use the history',
      text: 'Come back to previous sets, weekly consistency, macro totals, water progress, and measurement trends.',
    },
  ];

  const productFacts = [
    'Private web app at app.onerep.life',
    'Workout presets, routines, active sessions, and rest timers',
    'Food search, barcode lookup, recipe builder, calories, protein, carbs, and fat',
    'Water goal logging from the dashboard or water page',
    'Progress photos, body measurements, notes, and charts',
    'Settings for analytics, export, deletion, reminders, and offline queue sync',
  ];

  const limitations = [
    'Barcode lookup depends on product databases and can miss foods.',
    'Native reminders only run in supported installed iOS or Android builds.',
    'OneRep is a fitness log, not medical, nutrition, or training advice.',
    'Progress photos and body data are sensitive; do not email them to support.',
  ];

  const pages = [
    { path: '/', label: 'Home' },
    { path: '/privacy', label: 'Privacy' },
    { path: '/support', label: 'Support' },
    { path: '/terms', label: 'Terms' },
    { path: '/changelog', label: 'Changelog' },
    { path: '/about', label: 'About' },
    { path: '/guides', label: 'Guides' },
  ];

  const changelog = [
    {
      label: 'June 2026',
      title: 'The daily log got its missing pieces.',
      items: ['Barcode food lookup for packaged foods', 'Recipes with ingredient totals', 'Water goals on the home screen', 'Active workouts with set rows and rest timers'],
    },
    {
      label: 'May 2026',
      title: 'Progress tracking became more than a weight field.',
      items: ['Progress photos', 'Weight and body-fat charts', 'Waist, hips, chest, arms, thighs, calves, and neck', 'Body check-in reminder settings for supported device builds'],
    },
    {
      label: 'April 2026',
      title: 'The home screen got quieter.',
      items: ['Editable cards', 'Workout streaks', 'Logged meals grouped by meal', 'Less digging through tabs when you only need today'],
    },
  ];

  const supportItems = [
    { title: 'I cannot log in', text: 'Check the email you used, then try again on a steady connection. If it loops, send the email on the account and the device you are using.' },
    { title: 'Barcode scan misses', text: 'Clean the lens, hold still, and fill the box with the barcode. If the product is missing, search by name and log the closest match.' },
    { title: 'Camera is black', text: 'Give the browser or installed app camera permission. If permission changed recently, fully close OneRep and open it again.' },
    { title: 'A log did not sync', text: 'Open OneRep while online and leave it open for a minute. If changes are still pending, use Settings → Privacy & Offline → Sync offline queue.' },
    { title: 'Export my data', text: 'Go to Settings → Privacy & Offline → Export my data. Do this before deleting your account or moving to a new setup.' },
    { title: 'Delete my account', text: 'Go to Settings → Data → Delete account. Export first if you want a copy. Deletion is meant to be final, not a dark pattern.' },
  ];

  const bugChecklist = ['Your device and OS version', 'What you tapped right before it broke', 'The rough time it happened', 'A screenshot or screen recording if you have one', 'Whether you were offline, on Wi‑Fi, or on cellular'];

  const guides = [
    {
      title: 'Track workouts without making it homework',
      deck: 'The point is to know what you did last time, not write a novel between sets.',
      sections: [
        { heading: 'Log the minimum', text: 'Exercise, weight, reps, sets. Add rest time if it matters. Add notes only when they will help future you: “elbow hurt,” “too easy,” “machine was taken.”' },
        { heading: 'Use the same names', text: 'If Monday says “DB bench” and Friday says “dumbbell press,” your history gets messy. Pick one name and stick to it.' },
        { heading: 'Do not chase perfect data', text: 'Missed one set? Log the rest. Forgot the warmup? Fine. A decent record for twelve weeks beats a perfect record for two days.' },
      ],
    },
    {
      title: 'Track food without getting weird about food',
      deck: 'Food logging should answer one question: does the way you eat match the result you want?',
      sections: [
        { heading: 'Start with normal days', text: 'Do not begin on a vacation, a birthday dinner, or the Monday after deciding to become a new person. Log a plain Tuesday.' },
        { heading: 'Use recipes for repeat foods', text: 'Most people cook the same handful of meals in rotation. Build recipes for those meals, then log them instead of rebuilding ingredients every time.' },
        { heading: 'Watch the week', text: 'One high-calorie dinner is not a personality flaw. Seven days tells the truth better than one dramatic night.' },
      ],
    },
    {
      title: 'Take progress photos you can compare',
      deck: 'Bad photos lie. Good photos are boring on purpose.',
      sections: [
        { heading: 'Same setup every time', text: 'Same mirror, same distance, same light, same time of day. Morning is usually easiest. Do not compare pump lighting to bathroom lighting.' },
        { heading: 'Weekly beats daily', text: 'Daily photos turn water, sleep, and sodium into fake drama. Weekly is enough for most people.' },
        { heading: 'Pair photos with numbers', text: 'A photo plus weight, waist, and notes tells a better story than any one of them alone.' },
      ],
    },
  ];
</script>

<header class="site-header">
  <a class="brand" href="/" on:click={(event) => go(event, '/')} aria-label="OneRep home">
    <img class="brand-mark" src="/app-icon.svg" alt="" />
    <span class="brand-copy">
      <strong>OneRep</strong>
      <small>private log</small>
    </span>
  </a>
  <div class="header-actions">
    <nav aria-label="Primary navigation">
      <a href="/privacy" class:active={route === 'privacy'} on:click={(event) => go(event, '/privacy')}>Privacy</a>
      <a href="/support" class:active={route === 'support'} on:click={(event) => go(event, '/support')}>Support</a>
    </nav>
    <a class="header-open-app" href="https://app.onerep.life" on:click={openApp}>Open app <span aria-hidden="true">↗</span></a>
    <button
      class="theme-toggle"
      type="button"
      on:click={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {#if theme === 'dark'}
        <svg class="theme-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4"></circle>
          <path d="M12 2v2"></path>
          <path d="M12 20v2"></path>
          <path d="m4.93 4.93 1.41 1.41"></path>
          <path d="m17.66 17.66 1.41 1.41"></path>
          <path d="M2 12h2"></path>
          <path d="M20 12h2"></path>
          <path d="m6.34 17.66-1.41 1.41"></path>
          <path d="m19.07 4.93-1.41 1.41"></path>
        </svg>
      {:else}
        <svg class="theme-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.5 14.2A7.6 7.6 0 0 1 9.8 3.5 8.4 8.4 0 1 0 20.5 14.2Z"></path>
        </svg>
      {/if}
    </button>
  </div>
</header>

{#if appOpenMessage}
  <p class="app-open-fallback" role="status">{appOpenMessage}</p>
{/if}

{#if route === 'home'}
  <main id="top">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow">One private log for training, food, and progress</p>
        <h1 id="hero-title">Your body keeps receipts.</h1>
        <p class="hero-text">
          OneRep keeps the receipts in one private web app: workouts, routines, meals, recipes, water, goals, measurements, and progress photos.
        </p>
        <div class="hero-actions">
          <a class="button primary" href="https://app.onerep.life" on:click={openApp}>Open app</a>
          <a class="button secondary" href="/privacy" on:click={(event) => go(event, '/privacy')}>Privacy</a>
        </div>

        <div class="receipt-card" aria-label="Example daily log">
          <div class="receipt-head">
            <span>Today’s log</span>
            <strong>4 entries</strong>
          </div>
          {#each receipt as item, i}
            <div class="receipt-line" style={`--i: ${i}`}>
              <span>{item.time}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.meta}</p>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <div class="phone-stage" aria-label="OneRep app preview">
        <div class="stage-plate"></div>
        <img class="phone phone-main" src="/placeholders/hero-dashboard.svg" alt="OneRep home screen" />
        <img class="phone phone-side" src="/placeholders/food-scan.svg" alt="OneRep food diary screen" />
        <div class="app-chip chip-calories">
          <span>Calories</span>
          <strong>1,462 / 2,000</strong>
        </div>
        <div class="app-chip chip-workout">
          <span>Next</span>
          <strong>Lift day · 45 min</strong>
        </div>
        <a class="open-app-badge" href="https://app.onerep.life" on:click={openApp} aria-label="Open OneRep app">
          <span>Open app</span>
          <strong>↗</strong>
        </a>
      </div>
    </section>

    <div class="signal-strip" aria-hidden="true">
      <div>
        {#each [...signals, ...signals] as signal}
          <span>{signal}</span>
        {/each}
      </div>
    </div>

    <section id="privacy" class="principles-section" aria-labelledby="principles-title">
      <div class="section-heading compact">
        <p class="eyebrow">Why it feels different</p>
        <h2 id="principles-title">Less noise. More proof.</h2>
      </div>
      <div class="principles-grid">
        {#each principles as principle}
          <article class="principle-card">
            <h3>{principle.title}</h3>
            <p>{principle.text}</p>
          </article>
        {/each}
      </div>
    </section>

    <section id="tracking" class="detail-section" aria-labelledby="tracking-title">
      <div class="section-heading">
        <p class="eyebrow">What you can log</p>
        <h2 id="tracking-title">Lift. Eat. Check in.</h2>
      </div>
      <div class="detail-grid">
        {#each details as detail}
          <article class="detail-card">
            <img src={detail.image} alt="{detail.title} preview" />
            <div>
              <span>{detail.intro}</span>
              <h3>{detail.title}</h3>
              <ul>
                {#each detail.bullets as bullet}
                  <li>{bullet}</li>
                {/each}
              </ul>
            </div>
          </article>
        {/each}
      </div>
    </section>

    <section class="workflow-section" aria-labelledby="workflow-title">
      <div class="section-heading compact">
        <p class="eyebrow">How it works</p>
        <h2 id="workflow-title">A useful log starts small.</h2>
      </div>
      <div class="workflow-grid">
        {#each workflow as item}
          <article>
            <span>{item.step}</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        {/each}
      </div>
    </section>

    <section class="truth-section" aria-labelledby="truth-title">
      <div>
        <p class="eyebrow">What is real today</p>
        <h2 id="truth-title">Clear claims beat big claims.</h2>
      </div>
      <div class="truth-columns">
        <article>
          <h3>What the app offers</h3>
          <ul>
            {#each productFacts as fact}
              <li>{fact}</li>
            {/each}
          </ul>
        </article>
        <article>
          <h3>What to know</h3>
          <ul>
            {#each limitations as item}
              <li>{item}</li>
            {/each}
          </ul>
        </article>
      </div>
    </section>

    <section class="screen-row" aria-label="Daily check-in preview">
      <div class="screen-copy">
        <p class="eyebrow">Today’s dashboard</p>
        <h2>Know what you logged.</h2>
        <p>
          The day has a simple shape: train, eat, drink water, and check progress. OneRep keeps those signals together so you do not have to reconstruct the week from memory.
        </p>
      </div>
      <div class="screen-cards">
        <img src="/placeholders/progress-photo.svg" alt="OneRep progress screen" />
        <div class="mini-dashboard" aria-hidden="true">
          <div class="mini-top">
            <span>Today</span>
            <strong>Logged today</strong>
          </div>
          <div class="meal-line"><span>Breakfast</span><b>420</b></div>
          <div class="meal-line"><span>Lunch</span><b>610</b></div>
          <div class="meal-line"><span>Dinner</span><b>432</b></div>
          <div class="macro-line"><i></i><i></i><i></i></div>
        </div>
      </div>
    </section>

    <section id="waitlist" class="cta-panel" aria-labelledby="cta-title">
      <p class="eyebrow">For today</p>
      <h2 id="cta-title">Open OneRep and log the day.</h2>
      <p>Log the set. Log the meal. Add water. Save the check-in. Come back tomorrow with a clearer picture.</p>
      <a class="button primary" href="https://app.onerep.life" on:click={openApp}>Open app</a>
    </section>
  </main>
{:else}
  <main class="page-shell">
    {#if route === 'privacy'}
      <section class="page-hero narrow-page">
        <p class="eyebrow">Privacy · last updated June 23, 2026</p>
        <h1>Your log is not content.</h1>
        <p>Workout numbers, meals, body photos, and weigh-ins are private by nature. OneRep is built around that assumption.</p>
      </section>
      <section class="policy-stack">
        <article>
          <h2>The short version</h2>
          <ul>
            <li>We do not sell your food, workout, body, or photo data.</li>
            <li>OneRep has no public feed. Your progress photos are not posted anywhere.</li>
            <li>Analytics can be turned off from Settings.</li>
            <li>You can export your data or delete your account from the app.</li>
          </ul>
        </article>
        <article>
          <h2>What we collect</h2>
          <p>Account details such as your email and sign-in information. The logs you create: workout presets, routines, active workouts, exercises, sets, reps, weights, meals, recipes, water entries, body measurements, progress photos, notes, goals, reminders, privacy settings, and preferences.</p>
          <p>We may also collect basic device and diagnostic data, like app version, crash information, and whether a sync failed. If analytics are enabled, we use product events to see which parts of the app are broken, confusing, or unused.</p>
        </article>
        <article>
          <h2>Camera, photos, and notifications</h2>
          <p>Camera access is used for food barcode scanning and progress photos. Photo access is used only for files you choose. Native notifications are used only for reminders you turn on in supported installed builds.</p>
        </article>
        <article>
          <h2>How we use data</h2>
          <p>To run the app, sync your logs, show your history, calculate totals, troubleshoot bugs, prevent abuse, and improve the product when analytics are enabled. That is the job.</p>
        </article>
        <article>
          <h2>Who sees it</h2>
          <p>We use service providers for hosting, authentication, database storage, analytics, and support. They process data so OneRep can work. We do not sell your personal log to advertisers or data brokers.</p>
          <p>We may disclose information if required by law or to protect the app, users, or our systems.</p>
        </article>
        <article>
          <h2>Retention</h2>
          <p>We keep your account data while your account exists. If you delete the account, we start deleting the data tied to it. Backups and logs may take longer to age out, but they are not kept as a second profile.</p>
        </article>
        <article>
          <h2>Security</h2>
          <p>No app can promise magic. We use normal safeguards: authenticated access, provider-side security, and limited access to production data. Do not email us body photos or passwords.</p>
        </article>
        <article>
          <h2>Children</h2>
          <p>OneRep is not made for children under 13. If you believe a child used the app with personal information, email us and we will look into it.</p>
        </article>
        <article>
          <h2>Export, delete, or ask</h2>
          <p>Use Settings → Privacy & Offline to export your data. Use Settings → Data to delete your account. If something does not work, email <a href="mailto:support@onerep.life">support@onerep.life</a>. Tell us the email on the account so we can find the right record.</p>
        </article>
      </section>
    {:else if route === 'terms'}
      <section class="page-hero narrow-page">
        <p class="eyebrow">Terms · last updated June 24, 2026</p>
        <h1>Use OneRep like a log, not a doctor.</h1>
        <p>These terms explain the basic rules for using OneRep. They are written for the current web app at app.onerep.life.</p>
      </section>
      <section class="policy-stack">
        <article>
          <h2>The service</h2>
          <p>OneRep is a private fitness logging app for workouts, food, water, body measurements, progress photos, goals, reminders, and related settings.</p>
          <p>The app helps you record and review information. It does not provide medical, nutrition, mental health, or professional training advice.</p>
        </article>
        <article>
          <h2>Your account</h2>
          <p>You are responsible for the email, password, and data you add to OneRep. Do not share access to your account, and do not use someone else’s account.</p>
          <p>If you believe your account was accessed without permission, email <a href="mailto:support@onerep.life">support@onerep.life</a>.</p>
        </article>
        <article>
          <h2>Your data</h2>
          <p>You keep responsibility for the logs, measurements, notes, and photos you add. You can export your data from Settings → Privacy & Offline and request account deletion from Settings → Data.</p>
        </article>
        <article>
          <h2>Acceptable use</h2>
          <ul>
            <li>Do not abuse, attack, scrape, or attempt to bypass the app or its infrastructure.</li>
            <li>Do not upload illegal content or content that violates another person’s rights.</li>
            <li>Do not use OneRep in emergencies or as a substitute for professional advice.</li>
          </ul>
        </article>
        <article>
          <h2>Availability</h2>
          <p>OneRep may change, break, or go offline. We try to keep the app useful, but no app can promise uninterrupted service or perfect data accuracy.</p>
        </article>
        <article>
          <h2>Contact</h2>
          <p>Questions about these terms can be sent to <a href="mailto:support@onerep.life">support@onerep.life</a>.</p>
        </article>
      </section>
    {:else if route === 'support'}
      <section class="page-hero narrow-page">
        <p class="eyebrow">Support</p>
        <h1>Tell us what broke.</h1>
        <p>Email us with the boring details. Boring details fix bugs faster than “it does not work.” We do not offer phone support; written reports keep the details from getting lost.</p>
        <div class="page-actions">
          <a class="button primary" href="mailto:support@onerep.life?subject=OneRep%20support">support@onerep.life</a>
          <a class="button secondary" href="https://app.onerep.life" on:click={openApp}>Open app</a>
        </div>
      </section>
      <section class="support-layout">
        <article class="bug-card">
          <p class="eyebrow">Bug report checklist</p>
          <h2>Send this if you can.</h2>
          <ul>
            {#each bugChecklist as item}
              <li>{item}</li>
            {/each}
          </ul>
        </article>
        <div class="support-grid">
          {#each supportItems as item}
            <article>
              <h2>{item.title}</h2>
              <p>{item.text}</p>
            </article>
          {/each}
        </div>
      </section>
    {:else if route === 'reset-password'}
      <section class="page-hero narrow-page">
        <p class="eyebrow">Reset password</p>
        <h1>Pick a new password.</h1>
        <p>Use the link from your email. If it expired, request a new one from the app sign-in screen.</p>
      </section>
      <section class="copy-grid two-col">
        <article>
          <h2>Reset</h2>
          <form class="reset-form" on:submit={submitResetPassword}>
            <label>
              <span>New password</span>
              <input type="password" bind:value={newPassword} minlength="8" autocomplete="new-password" required />
            </label>
            <button class="button primary" type="submit">Change password</button>
          </form>
          {#if resetError}<p class="form-error">{resetError}</p>{/if}
          {#if resetMessage}<p class="form-message">{resetMessage}</p>{/if}
        </article>
        <article>
          <h2>After this</h2>
          <p>Go back to OneRep and sign in with the new password. Other sessions are revoked when the password changes.</p>
        </article>
      </section>
    {:else if route === 'changelog'}
      <section class="page-hero narrow-page">
        <p class="eyebrow">Changelog</p>
        <h1>Recent work.</h1>
        <p>No confetti. Just the things that make logging faster, clearer, or less annoying.</p>
      </section>
      <section class="timeline-list">
        {#each changelog as entry}
          <article>
            <span>{entry.label}</span>
            <h2>{entry.title}</h2>
            <ul>
              {#each entry.items as item}
                <li>{item}</li>
              {/each}
            </ul>
          </article>
        {/each}
      </section>
    {:else if route === 'about'}
      <section class="page-hero manifesto-page">
        <p class="eyebrow">About</p>
        <h1>No feed. No flexing. No fake coach voice.</h1>
        <p>OneRep is a private log for people who want to know what they did and whether it worked. That is the whole bet.</p>
      </section>
      <section class="copy-grid two-col">
        <article>
          <h2>What it is</h2>
          <p>A place to record the boring things that move the needle: routines, sets, meals, recipes, water, goals, weight, measurements, photos, and notes.</p>
        </article>
        <article>
          <h2>What it is not</h2>
          <p>Not a social network for abs. Not a coach pretending to know your life. Not a dashboard you need to babysit.</p>
        </article>
        <article>
          <h2>The point</h2>
          <p>Most fitness apps try to become entertainment. OneRep tries to stay useful. The best screen is the one you can fill out in ten seconds and trust later.</p>
        </article>
        <article>
          <h2>The line</h2>
          <p>No public body photos. No leaderboard for discipline. No cartoon trophy for drinking water. Your log should help you train, not perform.</p>
        </article>
      </section>
    {:else if route === 'guides'}
      <section class="page-hero narrow-page">
        <p class="eyebrow">Guides</p>
        <h1>Short notes for people who hate overthinking.</h1>
        <p>Useful beats perfect. These are small rules for logging when the gym is busy and dinner is already cold.</p>
      </section>
      <section class="guide-stack">
        {#each guides as guide}
          <article>
            <div>
              <p class="eyebrow">Guide</p>
              <h2>{guide.title}</h2>
              <p>{guide.deck}</p>
            </div>
            <div class="guide-sections">
              {#each guide.sections as section}
                <section>
                  <h3>{section.heading}</h3>
                  <p>{section.text}</p>
                </section>
              {/each}
            </div>
          </article>
        {/each}
      </section>
    {/if}
  </main>
{/if}

<footer class="site-footer">
  <div>
    <strong>OneRep</strong>
    <p>Private fitness logging for workouts, food, water, body measurements, and progress photos.</p>
  </div>
  <nav aria-label="Footer navigation">
    {#each pages as page}
      <a href={page.path} on:click={(event) => go(event, page.path)}>{page.label}</a>
    {/each}
  </nav>
</footer>
