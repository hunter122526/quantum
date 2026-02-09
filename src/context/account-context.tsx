"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { followerAccounts as initialFollowerAccounts, type FollowerAccount } from '@/lib/data';
import { useRouter } from 'next/navigation';
import { useToast } from "@/hooks/use-toast";

export interface NewFollowerInfo {
  id: string;
  name: string;
  telegramId?: string;
  initialBalance: number;
  lotMultiplier: number;
  clientId?: string;
  apiKey?: string;
  consentGiven?: boolean;
  sessionToken?: string;
}

interface ManualTradeInput {
    symbol: string;
    side: 'Buy' | 'Sell';
    quantity: number;
    price: number;
}

export interface FollowerTrade extends ManualTradeInput {
    id: string;
    timestamp: string;
}

export type FollowerTrades = {
    [followerId: string]: FollowerTrade[];
}

interface AccountContextType {
  followerAccounts: FollowerAccount[];
  masterAccounts: FollowerAccount[];
  followerTrades: FollowerTrades;
  addAccount: (info: NewFollowerInfo, type?: 'Follower' | 'Master') => Promise<{ success: boolean; message: string; password?: string, username?: string }>;
  removeFollower: (accountId: string) => Promise<void>;
  removeMaster: (accountId: string) => void;
  removeFollowerTrade: (followerId: string, tradeId: string) => void;
  clearFollowerTrades: (followerId: string) => void;
  updateFollowerSettings: (accountId: string, settings: Partial<Omit<FollowerAccount, 'id' | 'username' | 'password'>>) => void;
  addFollowerTrade: (followerId: string, tradeInput: ManualTradeInput) => void;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export function AccountProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [followerAccounts, setFollowerAccounts] = useState<FollowerAccount[]>([]);
  const [masterAccounts, setMasterAccounts] = useState<FollowerAccount[]>([]);
  const [followerTrades, setFollowerTrades] = useState<FollowerTrades>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const storedAccounts = localStorage.getItem('followerAccounts');
      if (storedAccounts) {
        const parsed = JSON.parse(storedAccounts);
        setFollowerAccounts(Array.isArray(parsed) ? parsed : []);
      } else {
        // Start with no followers (user adds them)
        setFollowerAccounts([]);
      }
      const storedTrades = localStorage.getItem('followerTrades');
      if (storedTrades) {
        setFollowerTrades(JSON.parse(storedTrades));
      }
      const storedMasters = localStorage.getItem('masterAccounts');
      if (storedMasters) {
        const parsed = JSON.parse(storedMasters);
        setMasterAccounts(Array.isArray(parsed) ? parsed : []);
      }
    } catch (e) {
        console.error("Failed to parse from localStorage", e);
        setFollowerAccounts([]);
        setFollowerTrades({});
        setMasterAccounts([]);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  const saveData = (accounts: FollowerAccount[], trades: FollowerTrades, masters: FollowerAccount[] = masterAccounts) => {
    localStorage.setItem('followerAccounts', JSON.stringify(accounts));
    localStorage.setItem('followerTrades', JSON.stringify(trades));
    localStorage.setItem('masterAccounts', JSON.stringify(masters));
  };
  const addAccount = async (info: NewFollowerInfo, type: 'Follower' | 'Master' = 'Follower') => {
    const exists = [...followerAccounts, ...masterAccounts].some(acc => acc.id.toLowerCase() === info.id.toLowerCase());
    if (exists) return { success: false, message: 'An account with this ID already exists.' };

    const newPassword = Math.random().toString(36).slice(-8);
    const newUsername = info.name.toLowerCase().replace(/\s/g, '') + Math.floor(10 + Math.random() * 90);

    const newAccount: FollowerAccount = {
      id: info.id,
      name: info.name,
      username: newUsername,
      password: newPassword,
      clientId: info.clientId || '',
      apiKey: info.apiKey || '',
      consentGiven: info.consentGiven || false,
      sessionToken: info.sessionToken || '',
      telegramId: info.telegramId,
      initialBalance: info.initialBalance,
      riskProfile: 'Moderate',
      lotMultiplier: info.lotMultiplier,
      perAccountCap: 100000,
      dailyLossLimit: 5000,
      maxExposurePerSymbol: 25000,
      currentPL: 0,
      status: 'Active',
    };

    // Save to database
    try {
      const res = await fetch('/api/followers/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newAccount.id,
          name: newAccount.name,
          username: newAccount.username,
          password: newAccount.password,
          telegramId: newAccount.telegramId,
          initialBalance: newAccount.initialBalance,
          riskProfile: newAccount.riskProfile,
          lotMultiplier: newAccount.lotMultiplier,
          perAccountCap: newAccount.perAccountCap,
          dailyLossLimit: newAccount.dailyLossLimit,
          maxExposurePerSymbol: newAccount.maxExposurePerSymbol,
          status: newAccount.status,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[ACCOUNT-ADD] Database save failed:', data);
        return { success: false, message: data?.message || 'Failed saving to database' };
      }

      console.log('[ACCOUNT-ADD] Successfully saved to database:', newAccount.id);
    } catch (err: any) {
      console.error('[ACCOUNT-ADD] Error saving to database:', err);
      // Continue with localStorage save even if database fails (graceful degradation)
      console.warn('[ACCOUNT-ADD] Continuing with localStorage-only save due to database error');
    }

    // Save to localStorage
    if (type === 'Master') {
      const updated = [...masterAccounts, newAccount];
      setMasterAccounts(updated);
      saveData(followerAccounts, followerTrades, updated);
      return { success: true, message: 'Master account added.', password: newPassword, username: newUsername };
    }

    const updatedAccounts = [...followerAccounts, newAccount];
    setFollowerAccounts(updatedAccounts);
    saveData(updatedAccounts, followerTrades);

    return { success: true, message: 'Follower added successfully.', password: newPassword, username: newUsername };
  };

  const removeFollower = async (accountId: string) => {
    // Try to remove from database first
    try {
      const res = await fetch(`/api/followers/delete?id=${encodeURIComponent(accountId)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn('[FOLLOWER-DELETE] Database delete failed:', data);
      } else {
        console.log('[FOLLOWER-DELETE] Successfully deleted from database:', accountId);
      }
    } catch (err: any) {
      console.error('[FOLLOWER-DELETE] Error deleting from database:', err);
      // Continue with localStorage removal even if database fails
    }

    // Remove from localStorage
    const updatedAccounts = followerAccounts.filter(acc => acc.id !== accountId);
    setFollowerAccounts(updatedAccounts);

    const newTrades = { ...followerTrades };
    delete newTrades[accountId];
    setFollowerTrades(newTrades);

    saveData(updatedAccounts, newTrades);

    toast({
      title: 'Account Removed',
      description: `Account ${accountId} has been removed.`,
    });
  };

  const removeFollowerTrade = (followerId: string, tradeId: string) => {
    const newTrades = { ...followerTrades };
    if (!Array.isArray(newTrades[followerId])) return;
    newTrades[followerId] = newTrades[followerId].filter(t => t.id !== tradeId);
    setFollowerTrades(newTrades);
    saveData(followerAccounts, newTrades);
  };

  const clearFollowerTrades = (followerId: string) => {
    const newTrades = { ...followerTrades };
    newTrades[followerId] = [];
    setFollowerTrades(newTrades);
    saveData(followerAccounts, newTrades);
  };

  const removeMaster = (accountId: string) => {
    const updated = masterAccounts.filter(acc => acc.id !== accountId);
    setMasterAccounts(updated);
    saveData(followerAccounts, followerTrades, updated);
    toast({ title: 'Master Removed', description: `Master ${accountId} removed.` });
  };

  const addFollowerTrade = (followerId: string, tradeInput: ManualTradeInput) => {
    const newTrade: FollowerTrade = {
      ...tradeInput,
      id: `FT${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    const updatedTrades = {
        ...followerTrades,
        [followerId]: [...(followerTrades[followerId] || []), newTrade]
    };
    setFollowerTrades(updatedTrades);
    saveData(followerAccounts, updatedTrades);
  };
  
    const updateFollowerSettings = (accountId: string, settings: Partial<Omit<FollowerAccount, 'id' | 'username' | 'password'>>) => {
      const updatedAccounts = followerAccounts.map(acc =>
        acc.id === accountId ? { ...acc, ...settings } : acc
      );
      setFollowerAccounts(updatedAccounts);
      saveData(updatedAccounts, followerTrades);
      toast({
        title: "Settings Updated",
        description: `Settings for ${accountId} have been saved.`
      })
    };

  return (
    <AccountContext.Provider value={{ 
      followerAccounts, 
      masterAccounts,
      followerTrades,
      addAccount, 
      removeFollower, 
      removeMaster,
      updateFollowerSettings,
      addFollowerTrade,
      removeFollowerTrade,
      clearFollowerTrades
    }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  return context;
}
