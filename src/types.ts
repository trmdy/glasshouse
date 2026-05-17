export type ProfileDriver = "managed" | "external";

export interface ProfileConfig {
  driver: ProfileDriver;
  userDataDir: string | null;
  port: number | null;
  headless: boolean;
  chrome: string | null;
  cdpUrl?: string | null;
  allowedHosts: string[];
  deniedHosts: string[];
}

export interface GlassConfig {
  defaultProfile: string;
  profiles: Record<string, ProfileConfig>;
}

export interface RefItem {
  selector: string;
}

export interface RuntimeState {
  profile: string;
  status?: "managed" | "external" | "stopped";
  pid?: number;
  port?: number | null;
  cdpUrl?: string | null;
  startedAt?: string;
  activeTargetId?: string;
  refs?: {
    createdAt: string;
    items: Record<string, RefItem>;
  };
}

export interface SnapshotElement {
  ref: string;
  role: string;
  name: string;
  text: string;
  selector: string;
  visible: boolean;
}

export interface SnapshotResult {
  url: string;
  title: string;
  elements: SnapshotElement[];
}
