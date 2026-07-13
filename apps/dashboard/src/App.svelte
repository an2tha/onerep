<script lang="ts">
  type Page = "overview" | "reports" | "users" | "entitlements" | "spend";
  type ReportStatus = "Open" | "In review" | "Resolved";
  type Entitlement = "Pro" | "Coach" | "Beta";

  type User = {
    id: string;
    name: string;
    email: string;
    initials: string;
    joined: string;
    lastSeen: string;
    requests: number;
    spend: number;
    entitlements: Entitlement[];
    status: "Active" | "Suspended";
  };

  type Report = {
    id: string;
    subject: string;
    detail: string;
    reporter: string;
    age: string;
    status: ReportStatus;
    priority: "High" | "Medium" | "Low";
  };

  const icons: Record<string, string> = {
    overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
    reports: "M4 4h16v16H4zM8 8h8M8 12h8M8 16h5",
    users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    entitlements: "M20 12v8H4v-8M2 7h20v5H2zM12 20V7M12 7H7.5A2.5 2.5 0 1 1 12 4.5V7Zm0 0h4.5A2.5 2.5 0 1 0 12 4.5V7Z",
    spend: "M3 3v18h18M7 16l4-5 4 3 5-7",
  };

  let page: Page = "overview";
  let query = "";
  let reportFilter: "All" | ReportStatus = "All";
  let userFilter: "All" | "Pro" | "Free" | "Suspended" = "All";
  let selectedUser: User | null = null;
  let toast = "";
  let mobileNavOpen = false;
  let dateRange = "30 days";

  let users: User[] = [
    { id: "usr_01", name: "Maya Chen", email: "maya@example.com", initials: "MC", joined: "May 2, 2026", lastSeen: "2 min ago", requests: 143, spend: 8.42, entitlements: ["Pro", "Beta"], status: "Active" },
    { id: "usr_02", name: "Jon Bell", email: "jon.bell@example.com", initials: "JB", joined: "Apr 18, 2026", lastSeen: "18 min ago", requests: 88, spend: 4.91, entitlements: ["Pro"], status: "Active" },
    { id: "usr_03", name: "Priya Shah", email: "priya@example.com", initials: "PS", joined: "Apr 11, 2026", lastSeen: "3 hours ago", requests: 21, spend: 1.12, entitlements: [], status: "Active" },
    { id: "usr_04", name: "Theo Martin", email: "theo@example.com", initials: "TM", joined: "Mar 29, 2026", lastSeen: "Yesterday", requests: 117, spend: 6.77, entitlements: ["Coach", "Pro"], status: "Active" },
    { id: "usr_05", name: "Nora Fischer", email: "nora@example.com", initials: "NF", joined: "Mar 20, 2026", lastSeen: "4 days ago", requests: 0, spend: 0, entitlements: [], status: "Suspended" },
    { id: "usr_06", name: "Elliot Ross", email: "elliot@example.com", initials: "ER", joined: "Mar 8, 2026", lastSeen: "6 days ago", requests: 65, spend: 3.58, entitlements: ["Pro"], status: "Active" },
  ];

  let reports: Report[] = [
    { id: "RPT-1842", subject: "Misleading recipe content", detail: "Community recipe · Protein pasta", reporter: "Maya Chen", age: "12 min", status: "Open", priority: "High" },
    { id: "RPT-1841", subject: "Unsafe nutrition recommendation", detail: "Coach response · Conversation 7F2", reporter: "Jon Bell", age: "48 min", status: "In review", priority: "High" },
    { id: "RPT-1840", subject: "Duplicate community recipe", detail: "Community recipe · Green smoothie", reporter: "Priya Shah", age: "2 hr", status: "Open", priority: "Medium" },
    { id: "RPT-1839", subject: "Incorrect macro information", detail: "Community recipe · Overnight oats", reporter: "Theo Martin", age: "5 hr", status: "Resolved", priority: "Low" },
    { id: "RPT-1838", subject: "Inappropriate recipe photo", detail: "Community recipe · Summer bowl", reporter: "Nora Fischer", age: "Yesterday", status: "Resolved", priority: "Medium" },
  ];

  const spendPoints = [44, 51, 47, 58, 62, 55, 71, 76, 69, 82, 79, 94];
  const sourceSpend = [
    { label: "Food snap", value: 128.42, pct: 46, color: "#e16d45" },
    { label: "Workout preset", value: 91.18, pct: 33, color: "#334b3e" },
    { label: "Progress metrics", value: 58.04, pct: 21, color: "#d4a938" },
  ];

  const nav: { key: Page; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "reports", label: "Reports" },
    { key: "users", label: "Users" },
    { key: "entitlements", label: "Entitlements" },
    { key: "spend", label: "Token spend" },
  ];

  const pageCopy: Record<Page, { eyebrow: string; title: string; deck: string }> = {
    overview: { eyebrow: "Monday, July 13", title: "Good morning, Ananth.", deck: "Here’s what needs your attention across OneRep." },
    reports: { eyebrow: "Content operations", title: "Reports", deck: "Review and resolve content flagged by the community." },
    users: { eyebrow: "Customer operations", title: "Users", deck: "Find accounts, review access, and manage user status." },
    entitlements: { eyebrow: "Access control", title: "Entitlements", deck: "Grant or remove product access for individual users." },
    spend: { eyebrow: "AI operations", title: "Token spend", deck: "Monitor request volume, cost, and feature-level usage." },
  };

  $: filteredReports = reports.filter((report) => {
    const matchesFilter = reportFilter === "All" || report.status === reportFilter;
    return matchesFilter && `${report.id} ${report.subject} ${report.reporter}`.toLowerCase().includes(query.toLowerCase());
  });

  $: filteredUsers = users.filter((user) => {
    const matchesFilter = userFilter === "All" || (userFilter === "Pro" && user.entitlements.includes("Pro")) || (userFilter === "Free" && user.entitlements.length === 0 && user.status !== "Suspended") || (userFilter === "Suspended" && user.status === "Suspended");
    return matchesFilter && `${user.name} ${user.email} ${user.id}`.toLowerCase().includes(query.toLowerCase());
  });

  function navigate(next: Page) {
    page = next;
    query = "";
    mobileNavOpen = false;
  }

  function showToast(message: string) {
    toast = message;
    window.setTimeout(() => { toast = ""; }, 2600);
  }

  function setReportStatus(reportId: string, status: ReportStatus) {
    reports = reports.map((report) => report.id === reportId ? { ...report, status } : report);
    showToast(`${reportId} marked ${status.toLowerCase()}`);
  }

  function toggleEntitlement(userId: string, entitlement: Entitlement) {
    users = users.map((user) => {
      if (user.id !== userId) return user;
      const has = user.entitlements.includes(entitlement);
      return { ...user, entitlements: has ? user.entitlements.filter((item) => item !== entitlement) : [...user.entitlements, entitlement] };
    });
    selectedUser = users.find((user) => user.id === userId) ?? null;
    const hasNow = selectedUser?.entitlements.includes(entitlement);
    showToast(`${entitlement} ${hasNow ? "granted to" : "removed from"} ${selectedUser?.name}`);
  }

  function toggleSuspension(userId: string) {
    users = users.map((user) => user.id === userId ? { ...user, status: user.status === "Active" ? "Suspended" : "Active" } : user);
    selectedUser = users.find((user) => user.id === userId) ?? null;
    showToast(`${selectedUser?.name} is now ${selectedUser?.status.toLowerCase()}`);
  }

  function linePath(points: number[]) {
    const width = 700;
    const height = 180;
    const min = Math.min(...points) - 8;
    const max = Math.max(...points) + 8;
    return points.map((value, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((value - min) / (max - min)) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
  }
</script>

<svelte:head><meta name="description" content="OneRep operations dashboard" /></svelte:head>

<div class="shell">
  <aside class:open={mobileNavOpen}>
    <div class="brand"><span class="brand-mark">1R</span><span>one<span>rep</span></span></div>
    <button class="mobile-close" aria-label="Close navigation" onclick={() => mobileNavOpen = false}>×</button>
    <nav aria-label="Dashboard navigation">
      <p>Workspace</p>
      {#each nav as item}
        <button class:active={page === item.key} onclick={() => navigate(item.key)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icons[item.key]} /></svg>
          {item.label}
          {#if item.key === "reports"}<span class="nav-count">{reports.filter((r) => r.status === "Open").length}</span>{/if}
        </button>
      {/each}
    </nav>
    <div class="sidebar-foot">
      <div class="demo-note"><span></span><div><strong>Demo data</strong><small>Backend connection pending</small></div></div>
      <button class="operator"><span>AV</span><div><strong>Ananth V</strong><small>Administrator</small></div><b>•••</b></button>
    </div>
  </aside>

  <main>
    <header class="topbar">
      <button class="menu" aria-label="Open navigation" onclick={() => mobileNavOpen = true}>☰</button>
      <div class="crumb"><span>OneRep</span><b>/</b><strong>{nav.find((item) => item.key === page)?.label}</strong></div>
      <div class="top-actions">
        <label class="global-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input bind:value={query} placeholder="Search {page === 'reports' ? 'reports' : 'users'}…" /><kbd>⌘K</kbd></label>
        <button class="icon-button" aria-label="Notifications"><span class="notification-dot"></span>♢</button>
      </div>
    </header>

    <div class="content">
      <section class="page-heading">
        <div><p>{pageCopy[page].eyebrow}</p><h1>{pageCopy[page].title}</h1><span>{pageCopy[page].deck}</span></div>
        {#if page === "spend" || page === "overview"}
          <select bind:value={dateRange} aria-label="Date range"><option>7 days</option><option>30 days</option><option>90 days</option></select>
        {:else if page === "users" || page === "entitlements"}
          <button class="primary" onclick={() => showToast("Invite link copied")}>+ Invite user</button>
        {/if}
      </section>

      {#if page === "overview"}
        <section class="stat-grid" aria-label="Key metrics">
          <article><div class="stat-top"><span class="stat-icon rust">↗</span><span class="trend up">↑ 12.4%</span></div><strong>2,847</strong><p>Monthly active users</p><small>vs. 2,532 last month</small></article>
          <article><div class="stat-top"><span class="stat-icon green">◎</span><span class="trend up">↑ 8.2%</span></div><strong>1,204</strong><p>Pro subscribers</p><small>42.3% conversion</small></article>
          <article><div class="stat-top"><span class="stat-icon gold">◈</span><span class="trend down">↓ 3.1%</span></div><strong>$277.64</strong><p>AI spend this month</p><small>68% of $410 budget</small></article>
          <article><div class="stat-top"><span class="stat-icon ink">!</span><span class="trend neutral">{reports.filter((r) => r.status === "Open").length} open</span></div><strong>{reports.length}</strong><p>Content reports</p><small>2 high priority</small></article>
        </section>

        <section class="overview-grid">
          <article class="panel attention">
            <div class="panel-head"><div><p>Needs attention</p><h2>Open reports</h2></div><button onclick={() => navigate("reports")}>View all →</button></div>
            <div class="report-list compact">
              {#each reports.filter((report) => report.status !== "Resolved").slice(0, 3) as report}
                <button onclick={() => navigate("reports")}><span class:high={report.priority === "High"}></span><div><strong>{report.subject}</strong><small>{report.id} · {report.age} ago</small></div><b>›</b></button>
              {/each}
            </div>
          </article>
          <article class="panel spend-card">
            <div class="panel-head"><div><p>AI usage</p><h2>Spend trend</h2></div><button onclick={() => navigate("spend")}>Details →</button></div>
            <div class="mini-chart"><svg viewBox="0 0 700 180" preserveAspectRatio="none"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e16d45" stop-opacity=".28"/><stop offset="1" stop-color="#e16d45" stop-opacity="0"/></linearGradient></defs><path class="area" d={`${linePath(spendPoints)} L700 180 L0 180 Z`}/><path class="line" d={linePath(spendPoints)}/></svg></div>
            <div class="chart-caption"><span>Jun 14</span><strong>$277.64 <small>this month</small></strong><span>Jul 13</span></div>
          </article>
        </section>

        <section class="panel activity-panel"><div class="panel-head"><div><p>Live feed</p><h2>Recent activity</h2></div></div><div class="activity-row"><span class="avatar rust">MC</span><p><strong>Maya Chen</strong> submitted a content report<small>12 minutes ago</small></p><span class="activity-type">Report</span></div><div class="activity-row"><span class="avatar green">JB</span><p><strong>Jon Bell</strong> upgraded to OneRep Pro<small>26 minutes ago</small></p><span class="activity-type">Entitlement</span></div><div class="activity-row"><span class="avatar gold">PS</span><p><strong>Priya Shah</strong> reached 80% of monthly AI quota<small>1 hour ago</small></p><span class="activity-type">Usage</span></div></section>

      {:else if page === "reports"}
        <section class="panel table-panel">
          <div class="table-toolbar"><div class="segmented">{#each ["All", "Open", "In review", "Resolved"] as filter}<button class:active={reportFilter === filter} onclick={() => reportFilter = filter as typeof reportFilter}>{filter}{#if filter === "Open"}<span>{reports.filter((r) => r.status === "Open").length}</span>{/if}</button>{/each}</div><span>{filteredReports.length} reports</span></div>
          <div class="data-table reports-table"><div class="table-row table-header"><span>Report</span><span>Reporter</span><span>Priority</span><span>Status</span><span></span></div>{#each filteredReports as report}<div class="table-row"><div><strong>{report.subject}</strong><small>{report.id} · {report.detail}</small></div><span>{report.reporter}<small>{report.age} ago</small></span><span><i class:high={report.priority === "High"} class:medium={report.priority === "Medium"}></i>{report.priority}</span><span class="status {report.status.toLowerCase().replace(' ', '-')}">{report.status}</span><select value={report.status} onchange={(event) => setReportStatus(report.id, event.currentTarget.value as ReportStatus)} aria-label={`Update ${report.id}`}><option>Open</option><option>In review</option><option>Resolved</option></select></div>{/each}</div>
          {#if filteredReports.length === 0}<div class="empty"><strong>No reports found</strong><span>Try another search or status filter.</span></div>{/if}
        </section>

      {:else if page === "users" || page === "entitlements"}
        <section class="panel table-panel">
          <div class="table-toolbar"><div class="segmented">{#each ["All", "Pro", "Free", "Suspended"] as filter}<button class:active={userFilter === filter} onclick={() => userFilter = filter as typeof userFilter}>{filter}</button>{/each}</div><span>{filteredUsers.length} users</span></div>
          <div class="data-table users-table"><div class="table-row table-header"><span>User</span><span>Entitlements</span><span>AI requests</span><span>Last active</span><span></span></div>{#each filteredUsers as user}<button class="table-row" onclick={() => selectedUser = user}><div class="user-cell"><span class="avatar">{user.initials}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></div><div class="chips">{#if user.entitlements.length}{#each user.entitlements as entitlement}<span>{entitlement}</span>{/each}{:else}<small>Free plan</small>{/if}</div><span>{user.requests} / 150<small>${user.spend.toFixed(2)} spend</small></span><span>{user.lastSeen}<small class:suspended={user.status === "Suspended"}>{user.status}</small></span><b>›</b></button>{/each}</div>
        </section>

      {:else if page === "spend"}
        <section class="stat-grid spend-stats"><article><p>Total spend</p><strong>$277.64</strong><small><span class="trend up">↑ 6.8%</span> from last period</small></article><article><p>AI requests</p><strong>4,829</strong><small>Avg. $0.057 per request</small></article><article><p>Projected month-end</p><strong>$391.20</strong><small>95% of monthly budget</small></article><article><p>Users at quota</p><strong>18</strong><small>0.6% of active users</small></article></section>
        <section class="spend-layout"><article class="panel large-chart"><div class="panel-head"><div><p>Daily cost</p><h2>Token spend</h2></div><span class="legend"><i></i> Total cost</span></div><div class="chart-wrap"><div class="y-axis"><span>$12</span><span>$8</span><span>$4</span><span>$0</span></div><svg viewBox="0 0 700 240" preserveAspectRatio="none"><path class="grid-line" d="M0 20H700M0 87H700M0 154H700M0 220H700"/><path class="area" d={`${linePath(spendPoints)} L700 220 L0 220 Z`}/><path class="line" d={linePath(spendPoints)}/></svg></div><div class="x-axis"><span>Jun 14</span><span>Jun 21</span><span>Jun 28</span><span>Jul 5</span><span>Jul 13</span></div></article><article class="panel breakdown"><div class="panel-head"><div><p>By feature</p><h2>Cost breakdown</h2></div></div><div class="donut" style="--food:46%; --workout:79%"><div><strong>$277</strong><span>total</span></div></div>{#each sourceSpend as source}<div class="source-row"><i style={`background:${source.color}`}></i><span>{source.label}<small>{source.pct}% of spend</small></span><strong>${source.value.toFixed(2)}</strong></div>{/each}</article></section>
        <section class="panel table-panel"><div class="panel-head"><div><p>Highest usage</p><h2>Top users by spend</h2></div><button onclick={() => navigate("users")}>Manage users →</button></div><div class="data-table spend-table">{#each [...users].sort((a,b) => b.spend-a.spend).slice(0,5) as user}<button class="table-row" onclick={() => { selectedUser = user; page = "users"; }}><div class="user-cell"><span class="avatar">{user.initials}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></div><span>{user.requests} requests</span><span class="usage-bar"><i style={`width:${user.requests/1.5}%`}></i></span><strong>${user.spend.toFixed(2)}</strong><b>›</b></button>{/each}</div></section>
      {/if}
    </div>
  </main>
</div>

{#if selectedUser}
  <button class="drawer-backdrop" aria-label="Close user details" onclick={() => selectedUser = null}></button>
  <aside class="drawer">
    <button class="drawer-close" aria-label="Close" onclick={() => selectedUser = null}>×</button>
    <p>User details</p><div class="drawer-user"><span class="avatar large">{selectedUser.initials}</span><h2>{selectedUser.name}</h2><span>{selectedUser.email}</span><code>{selectedUser.id}</code></div>
    <div class="drawer-stats"><div><span>Joined</span><strong>{selectedUser.joined}</strong></div><div><span>Last active</span><strong>{selectedUser.lastSeen}</strong></div><div><span>AI requests</span><strong>{selectedUser.requests} / 150</strong></div><div><span>Token spend</span><strong>${selectedUser.spend.toFixed(2)}</strong></div></div>
    <section class="entitlement-manager"><div><h3>Entitlements</h3><p>Changes apply to this account immediately.</p></div>{#each ["Pro", "Coach", "Beta"] as entitlement}<label><span><strong>OneRep {entitlement}</strong><small>{entitlement === "Pro" ? "Premium AI and tracking features" : entitlement === "Coach" ? "Coach workspace and client tools" : "Early access to new features"}</small></span><input type="checkbox" checked={selectedUser.entitlements.includes(entitlement as Entitlement)} onchange={() => toggleEntitlement(selectedUser!.id, entitlement as Entitlement)} /><i></i></label>{/each}</section>
    <button class="danger" onclick={() => toggleSuspension(selectedUser!.id)}>{selectedUser.status === "Active" ? "Suspend user" : "Restore user"}</button>
  </aside>
{/if}

{#if toast}<div class="toast"><span>✓</span>{toast}</div>{/if}
