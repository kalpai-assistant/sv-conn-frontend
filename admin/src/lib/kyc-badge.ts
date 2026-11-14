/**
 * How a screen tells the shell the KYC count has changed. There's no shared query
 * cache in this app, and the sidebar and the KYC page only meet at AdminShell.
 */
import { createContext, useContext } from "react";

const KycBadgeContext = createContext<() => void>(() => {});

export const KycBadgeProvider = KycBadgeContext.Provider;

export function useRefreshKycBadge(): () => void {
  return useContext(KycBadgeContext);
}
