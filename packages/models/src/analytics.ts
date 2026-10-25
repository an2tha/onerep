export type AnalyticsCohort = {
  week: string;
  signups: number;
  activated: number | null;
  retained: number | null;
  activationStatus: "available" | "pending" | "unavailable";
  retentionStatus: "available" | "pending" | "unavailable";
};

export type AnalyticsReport = {
  asOf: number;
  totals: {
    signups: number;
    workoutUsers: number;
    repeatDayUsers: number | null;
    active7: number | null;
    active30: number | null;
  };
  cohorts: AnalyticsCohort[];
  comparisons: {
    signups7: number | null;
    signupsPrevious7: number | null;
    signups30: number | null;
    signupsPrevious30: number | null;
    activePrevious7: number | null;
    activePrevious30: number | null;
  };
  weekly: {
    week: string;
    signups: number | null;
    activeUsers: number | null;
    partial: boolean;
  }[];
  quality: {
    excludedAccounts: number;
    unknownSignupAccounts: number;
    unlinkedWorkoutRecords: number;
    invalidWorkoutDates: number;
    invalidLogTimes: number;
  };
};

export type AnalyticsCoverage =
  "available" | "partial" | "unverified" | "unavailable";
export type AnalyticsWindowKey = "yesterday" | "last7" | "last30";
type SocialContent = {
  url: string;
  title: string;
  publishedOn: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
};
export type TikTokWindow = {
  key: AnalyticsWindowKey;
  from: string;
  to: string;
  videoCoverage: AnalyticsCoverage;
  activityCoverage: AnalyticsCoverage;
  videos: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  netFollowers: number | null;
  profileViews: number | null;
  accountViews: number | null;
  topVideos: SocialContent[];
};
export type TikTokSnapshot = {
  provider: "metricool";
  brandId: "7632357";
  accountHandle: "onerep.life";
  timezone: "Europe/Berlin";
  capturedAt: number;
  connectedAt: number;
  accountAsOf: string | null;
  followers: number | null;
  history?: {
    date: string;
    videoViews: number | null;
    followers: number | null;
  }[];
  windows: TikTokWindow[];
};
export type InstagramSnapshot = {
  provider: "metricool";
  brandId: "7632357";
  accountHandle: "onerep_app";
  timezone: "Europe/Berlin";
  capturedAt: number;
  accountAsOf: string | null;
  followers: number | null;
  history: {
    date: string;
    contentViews: number | null;
    followers: number | null;
  }[];
  windows: {
    key: AnalyticsWindowKey;
    from: string;
    to: string;
    contentCoverage: AnalyticsCoverage;
    contentCount: number | null;
    feedPosts: number | null;
    reels: number | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    saves: number | null;
    shares: number | null;
    topContent: (SocialContent & { saves: number | null })[];
  }[];
};
