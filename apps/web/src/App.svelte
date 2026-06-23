<script lang="ts">
  import { onMount } from 'svelte';

  type Route = 'home' | 'download' | 'privacy' | 'support' | 'screens' | 'changelog' | 'about' | 'guides';

  const routes: Record<string, Route> = {
    '/': 'home',
    '/download': 'download',
    '/privacy': 'privacy',
    '/support': 'support',
    '/screens': 'screens',
    '/changelog': 'changelog',
    '/about': 'about',
    '/guides': 'guides',
  };

  let theme: 'light' | 'dark' = 'light';
  let route: Route = typeof window === 'undefined' ? 'home' : routeFromPath(window.location.pathname);

  function routeFromPath(path: string): Route {
    return routes[path] ?? 'home';
  }

  function setTheme(next: 'light' | 'dark') {
    theme = next;
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
  }

  function go(event: MouseEvent, path: string) {
    event.preventDefault();
    history.pushState(null, '', path);
    route = routeFromPath(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onMount(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    setTheme(saved ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

    const onPop = () => {
      route = routeFromPath(window.location.pathname);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
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
    { path: '/screens', label: 'Screens' },
    { path: '/privacy', label: 'Privacy' },
    { path: '/support', label: 'Support' },
    { path: '/changelog', label: 'Changelog' },
    { path: '/about', label: 'About' },
    { path: '/guides', label: 'Guides' },
  ];

  const screenShots = [
    { title: 'Home', text: 'The day at a glance: workout, food, water, streak, progress.', image: '/placeholders/hero-dashboard.svg' },
    { title: 'Food', text: 'Search, scan, save recipes, and log the meal before you forget it.', image: '/placeholders/food-scan.svg' },
    { title: 'Progress', text: 'Weight, measurements, notes, and photos in the same place.', image: '/placeholders/progress-photo.svg' },
    { title: 'Workout', text: 'Sets, reps, rest, and the next thing to do.', image: '/placeholders/workout-tile.svg' },
  ];

  const changelog = [
    {
      label: 'Current build',
      title: 'Food scan, recipes, water, and workout logging now sit together.',
      items: ['Barcode food lookup', 'Recipe totals', 'Water goals', 'Active workouts with rest timers'],
    },
    {
      label: 'Recent',
      title: 'Progress tracking stopped being an afterthought.',
      items: ['Progress photos', 'Weight and body-fat charts', 'Circumference measurements', 'Check-in reminders'],
    },
    {
      label: 'Recent',
      title: 'The home screen got quieter.',
      items: ['Editable cards', 'Workout streaks', 'Logged meals', 'Less digging through tabs'],
    },
  ];

  const supportItems = [
    { title: 'Delete my account', text: 'Open Settings in the app. Export first if you want a copy, then delete from the account section.' },
    { title: 'Export my data', text: 'Settings has an export action. Use it before changing phones or wiping an account.' },
    { title: 'Camera will not scan', text: 'Check camera permission, clean the lens, and put the barcode under steady light. Boring, but it works.' },
    { title: 'Logs look stuck', text: 'If you logged offline, reopen the app with internet. OneRep will try to push the waiting changes.' },
  ];

  const guides = [
    {
      title: 'Track workouts without making it homework',
      text: 'Write the exercise, the weight, and the reps. Rest. Do the next set. That is enough for most people most of the time.',
    },
    {
      title: 'Use food tracking without getting weird about it',
      text: 'Start with a normal day. Save the meals you repeat. Watch the weekly pattern, not one messy dinner.',
    },
    {
      title: 'Take progress photos you can compare',
      text: 'Same mirror. Same light. Same time of day. Weekly beats daily, unless you enjoy lying to yourself with bathroom shadows.',
    },
  ];
</script>

<header class="site-header">
  <a class="brand" href="/" on:click={(event) => go(event, '/')} aria-label="OneRep home">
    <span class="brand-mark">1R</span>
    <span>OneRep</span>
  </a>
  <div class="header-actions">
    <nav aria-label="Primary navigation">
      <a href="/download" class:active={route === 'download'} on:click={(event) => go(event, '/download')}>Download</a>
      <a href="/screens" class:active={route === 'screens'} on:click={(event) => go(event, '/screens')}>Screens</a>
      <a href="/privacy" class:active={route === 'privacy'} on:click={(event) => go(event, '/privacy')}>Privacy</a>
      <a href="/support" class:active={route === 'support'} on:click={(event) => go(event, '/support')}>Support</a>
    </nav>
    <a class="header-open-app" href="onerep://">Open app</a>
    <button class="theme-toggle" type="button" on:click={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode">
      {theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  </div>
</header>

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
          <a class="button secondary" href="/screens" on:click={(event) => go(event, '/screens')}>See the screens</a>
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

      <div id="screens" class="phone-stage" aria-label="OneRep app preview">
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
        <a class="open-app-badge" href="onerep://" aria-label="Open OneRep app">
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

    <section class="screen-row" aria-label="More app screens">
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
          <h1>Open OneRep.</h1>
          <p>Already installed? Hit the black button. On desktop, scan the mark or send yourself the link.</p>
          <div class="page-actions">
            <a class="button primary" href="onerep://">Open app</a>
            <a class="button secondary" href="mailto:?subject=Open OneRep&body=Open OneRep on your phone: onerep://">Send link</a>
          </div>
        </div>
        <div class="qr-card" aria-label="OneRep QR-style mark">
          <span>ONEREP</span>
          <div class="qr-grid">
            {#each Array(49) as _, i}
              <i class:filled={i % 2 === 0 || i % 7 === 3 || [5, 9, 11, 17, 23, 31, 37, 41].includes(i)}></i>
            {/each}
          </div>
          <p>App Store and Play Store links go here when they are public.</p>
        </div>
      </section>
    {:else if route === 'privacy'}
      <section class="page-hero narrow-page">
        <p class="eyebrow">Privacy</p>
        <h1>Your log is not content.</h1>
        <p>Workout numbers, meals, body photos, and weigh-ins are private by nature. OneRep treats them that way.</p>
      </section>
      <section class="copy-grid two-col">
        <article>
          <h2>Plain English</h2>
          <ul>
            <li>We do not sell your food, workout, body, or photo data.</li>
            <li>There is no public feed. Nothing is posted for other users to judge.</li>
            <li>Product analytics can be turned off from Settings.</li>
            <li>You can export your data or delete your account from the app.</li>
          </ul>
        </article>
        <article>
          <h2>What the app needs</h2>
          <p>OneRep stores the things you choose to log: workouts, meals, water, measurements, progress photos, reminders, preferences, and account details needed to keep you signed in.</p>
          <p>Camera access is used when you scan food or add photos. Notifications are used only if you turn on reminders.</p>
        </article>
      </section>
    {:else if route === 'support'}
      <section class="page-hero narrow-page">
        <p class="eyebrow">Support</p>
        <h1>Something weird?</h1>
        <p>Email us. Include what you tapped, what you expected, and what happened instead. Screenshots help.</p>
        <div class="page-actions">
          <a class="button primary" href="mailto:hello@onerep.app">hello@onerep.app</a>
        </div>
      </section>
      <section class="support-grid">
        {#each supportItems as item}
          <article>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        {/each}
      </section>
    {:else if route === 'screens'}
      <section class="page-hero narrow-page">
        <p class="eyebrow">Screens</p>
        <h1>The app, without the pitch deck.</h1>
        <p>Home, food, workouts, and progress. The stuff you touch most often gets the most room.</p>
      </section>
      <section class="gallery-grid">
        {#each screenShots as shot}
          <article>
            <img src={shot.image} alt="OneRep {shot.title} screen" />
            <div>
              <h2>{shot.title}</h2>
              <p>{shot.text}</p>
            </div>
          </article>
        {/each}
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
        <p>Useful beats perfect. These are small rules you can follow when the gym is busy and dinner is already cold.</p>
      </section>
      <section class="guide-grid">
        {#each guides as guide}
          <article>
            <h2>{guide.title}</h2>
            <p>{guide.text}</p>
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
