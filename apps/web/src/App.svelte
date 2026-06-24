<script lang="ts">
  import { onMount } from 'svelte';
  import { createAuthClient } from 'better-auth/client';

  type Route = 'home' | 'download' | 'privacy' | 'support' | 'changelog' | 'about' | 'guides' | 'reset-password';

  const routes: Record<string, Route> = {
    '/': 'home',
    '/download': 'download',
    '/privacy': 'privacy',
    '/support': 'support',
    '/changelog': 'changelog',
    '/reset-password': 'reset-password',
    '/about': 'about',
    '/guides': 'guides',
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
        appOpenMessage = 'If nothing opened, install OneRep on this phone when store links are live.';
      }
    }, 1200);
  }

  onMount(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    setTheme(saved ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

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
    { time: '7:12 AM', title: 'Greek yogurt bowl', meta: '420 calories · breakfast' },
    { time: '12:41 PM', title: 'Push day started', meta: 'Bench, incline, triceps' },
    { time: '6:03 PM', title: 'Water checked off', meta: '2.0 L down · 0.5 L left' },
    { time: 'Sunday', title: 'Progress photo added', meta: 'Week 08 comparison saved' },
  ];

  const signals = ['lift', 'eat', 'hydrate', 'measure', 'repeat', 'sleep', 'adjust', 'show up'];

  const principles = [
    {
      title: 'Simplicity by design',
      text: 'Built like a pocket notebook: open it, add the thing, close it. No maze of menus.',
    },
    {
      title: 'Privacy first',
      text: 'Your meals, weight, body photos, and workouts are yours. No public feed. No performative sharing.',
    },
    {
      title: 'No fake hype',
      text: 'OneRep helps you repeat the basics: lift, eat, hydrate, check in. It does not pretend badges build muscle.',
    },
  ];

  const details = [
    {
      title: 'Lift',
      image: '/placeholders/workout-tile.svg',
      intro: 'A workout log that stays with the set you are on.',
      bullets: ['Plan the week', 'Record weight, reps, and sets', 'Use rest timers', 'Save strength, cardio, or mobility days'],
    },
    {
      title: 'Eat',
      image: '/placeholders/food-tile.svg',
      intro: 'A food diary fast enough to use before the plate is gone.',
      bullets: ['Search foods by name', 'Scan barcodes', 'Save repeat meals', 'Track calories, protein, carbs, and fat'],
    },
    {
      title: 'Check in',
      image: '/placeholders/progress-tile.svg',
      intro: 'A progress log for the stuff the mirror forgets.',
      bullets: ['Track weight and body fat', 'Measure waist, arms, legs, and more', 'Add progress photos', 'Set a check-in reminder'],
    },
  ];

  const pages = [
    { path: '/', label: 'Home' },
    { path: '/download', label: 'Download' },
    { path: '/privacy', label: 'Privacy' },
    { path: '/support', label: 'Support' },
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
      items: ['Progress photos', 'Weight and body-fat charts', 'Waist, hips, chest, arms, thighs, calves, and neck', 'Daily check-in reminders'],
    },
    {
      label: 'April 2026',
      title: 'The home screen got quieter.',
      items: ['Editable cards', 'Workout streaks', 'Logged meals grouped by meal', 'Less digging through tabs when you only need today'],
    },
  ];

  const supportItems = [
    { title: 'I cannot log in', text: 'Check the email you used, then try again on a steady connection. If it loops, send the email on the account and the device you are using.' },
    { title: 'Barcode scan misses', text: 'Clean lens. Hold still. Fill the box with the barcode. If the food is missing, search by name and save it as a repeat meal.' },
    { title: 'Camera is black', text: 'Give OneRep camera permission in system settings. On iPhone, fully close the app once after changing permission.' },
    { title: 'A log did not sync', text: 'Open the app on Wi‑Fi and leave it open for a minute. Offline logs queue up; they need a clean connection to leave the phone.' },
    { title: 'Export my data', text: 'Go to Settings → Export. Do this before deleting your account or moving to a new phone.' },
    { title: 'Delete my account', text: 'Go to Settings → Delete account. Export first if you want a copy. Deletion is meant to be final, not a dark pattern.' },
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
        { heading: 'Save repeat meals', text: 'Most people eat the same ten meals in rotation. Save those first. Then the hard part becomes rare.' },
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
      <a href="/download" class:active={route === 'download'} on:click={(event) => go(event, '/download')}>Download</a>
      <a href="/privacy" class:active={route === 'privacy'} on:click={(event) => go(event, '/privacy')}>Privacy</a>
      <a href="/support" class:active={route === 'support'} on:click={(event) => go(event, '/support')}>Support</a>
    </nav>
    <a class="header-open-app" href="https://app.onerep.life" on:click={openApp}>Open app <span>↗</span></a>
    <button class="theme-toggle" type="button" on:click={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode">
      ◐
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
          OneRep keeps the receipts in one place: the workout you did, the food you ate, the water you drank, and the photos and measurements that show what changed.
        </p>
        <div class="hero-actions">
          <a class="button primary" href="/download" on:click={(event) => go(event, '/download')}>Download / open</a>
          <a class="button secondary" href="/privacy" on:click={(event) => go(event, '/privacy')}>Privacy first</a>
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

    <section class="screen-row" aria-label="Daily check-in preview">
      <div class="screen-copy">
        <p class="eyebrow">The daily check-in</p>
        <h2>Know what needs attention.</h2>
        <p>
          The day has a simple shape: train, eat, drink water, check progress. OneRep keeps those signals together so you do not have to reconstruct your week from memory.
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
      <p class="eyebrow">For your phone</p>
      <h2 id="cta-title">Stop guessing what worked.</h2>
      <p>Log the set. Log the meal. Add the check-in. Come back tomorrow with a clearer picture.</p>
      <a class="button primary" href="/download" on:click={(event) => go(event, '/download')}>Download / open</a>
    </section>
  </main>
{:else}
  <main class="page-shell">
    {#if route === 'download'}
      <section class="page-hero split-page">
        <div>
          <p class="eyebrow">Download</p>
          <h1>Get it on the phone you actually train with.</h1>
          <p>If OneRep is already installed, open it from here. If not, send yourself the link and install it when the store links are live.</p>
          <div class="page-actions">
            <a class="button primary" href="https://app.onerep.life" on:click={openApp}>Open app</a>
            <a class="button secondary" href="mailto:?subject=Open OneRep&body=Open OneRep on your phone: https://app.onerep.life">Send link to myself</a>
          </div>
        </div>
        <div class="qr-card" aria-label="OneRep QR-style mark">
          <span>Phone handoff</span>
          <div class="qr-grid">
            {#each Array(49) as _, i}
              <i class:filled={i % 2 === 0 || i % 7 === 3 || [5, 9, 11, 17, 23, 31, 37, 41].includes(i)}></i>
            {/each}
          </div>
          <p>Desktop visitor? This spot becomes the QR code for the app once the public store pages are ready.</p>
        </div>
      </section>
      <section class="copy-grid two-col">
        <article>
          <h2>If the button does nothing</h2>
          <p>Your browser tried to open the OneRep app. If nothing happened, the app is probably not installed on this device yet.</p>
        </article>
        <article>
          <h2>What to do first</h2>
          <p>Start with one workout and one normal day of food. Do not rebuild your whole life on day one. Log the obvious stuff first.</p>
        </article>
      </section>
    {:else if route === 'privacy'}
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
          <p>Account details such as your email and sign-in information. The logs you create: workouts, exercises, sets, reps, weights, meals, recipes, water entries, body measurements, photos, reminders, and preferences.</p>
          <p>We may also collect basic device and diagnostic data, like app version, crash information, and whether a sync failed. If analytics are enabled, we use product events to see which parts of the app are broken, confusing, or unused.</p>
        </article>
        <article>
          <h2>Camera, photos, and notifications</h2>
          <p>Camera access is used when you scan a barcode or add a progress photo. Photo access is used only for photos you choose. Notifications are used only for reminders you turn on.</p>
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
          <p>Use Settings to export your data or delete your account. If something does not work, email <a href="mailto:support@onerep.life">support@onerep.life</a>. Tell us the email on the account so we can find the right record.</p>
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
          <p>A place to record the boring things that move the needle: sets, meals, water, weight, measurements, photos, and notes.</p>
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
    <p>Private fitness logging for workouts, food, water, and progress.</p>
  </div>
  <nav aria-label="Footer navigation">
    {#each pages as page}
      <a href={page.path} on:click={(event) => go(event, page.path)}>{page.label}</a>
    {/each}
  </nav>
</footer>
