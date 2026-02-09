export type FollowerAccount = {
  id: string;
  name: string;
  username: string;
  password?: string; // Password should be handled securely and might not always be present on the client
  clientId?: string;
  apiKey?: string;
  consentGiven?: boolean;
  sessionToken?: string;
  telegramId?: string;
  initialBalance: number;
  riskProfile: 'Conservative' | 'Moderate' | 'Aggressive';
  lotMultiplier: number;
  perAccountCap: number;
  dailyLossLimit: number;
  maxExposurePerSymbol: number;
  currentPL: number;
  status: 'Active' | 'Paused' | 'Disconnected';
};

// Start with no demo followers - they should be added by user
export const followerAccounts: FollowerAccount[] = [];

export type Trade = {
  id: string;
  timestamp: string;
  account: 'Master' | string; // Master or follower ID
  symbol: string;
  type: 'Market' | 'Limit' | 'Stop';
  side: 'Buy' | 'Sell';
  quantity: number;
  price: number;
  status: 'Filled' | 'Partial Fill' | 'Cancelled' | 'Pending';
  isNew?: boolean;
};

// This is a mix of real master trades and some follower trades for simulation
export const trades: Trade[] = [
    { id: 'T001', timestamp: '10:30:05', account: 'Master', symbol: 'RELIANCE', type: 'Market', side: 'Buy', quantity: 100, price: 2850.50, status: 'Filled' },
    { id: 'T002', timestamp: '10:32:15', account: 'Master', symbol: 'TCS', type: 'Limit', side: 'Sell', quantity: 50, price: 3900.00, status: 'Pending' },
    { id: 'T003', timestamp: '10:35:40', account: 'Master', symbol: 'INFY', type: 'Market', side: 'Buy', quantity: 200, price: 1650.25, status: 'Filled' },
    { id: 'T004', timestamp: '10:45:10', account: 'Master', symbol: 'HDFCBANK', type: 'Market', side: 'Sell', quantity: 75, price: 1550.80, status: 'Filled' },
    { id: 'T101', timestamp: '11:01:15', account: 'ZERODHA-001', symbol: 'WIPRO', type: 'Market', side: 'Buy', quantity: 50, price: 480.10, status: 'Filled' },
    { id: 'T102', timestamp: '11:05:20', account: 'UPSTOX-002', symbol: 'RELIANCE', type: 'Market', side: 'Sell', quantity: 200, price: 2855.00, status: 'Filled' },
];


export type LogEntry = {
  id: string;
  timestamp: string;
  level: 'Info' | 'Warning' | 'Error' | 'Intervention';
  message: string;
};

export const logs: LogEntry[] = [
    { id: 'L001', timestamp: '2024-07-30 10:30:05', level: 'Info', message: 'Master order placed: BUY 100 RELIANCE @ Market' },
    { id: 'L002', timestamp: '2024-07-30 10:30:06', level: 'Info', message: 'Mirrored order to FA-001: BUY 100 RELIANCE @ Market' },
    { id: 'L003', timestamp: '2024-07-30 10:30:06', level: 'Info', message: 'Mirrored order to FA-002: BUY 200 RELIANCE @ Market' },
    { id: 'L004', timestamp: '2024-07-30 10:30:07', level: 'Info', message: 'Mirrored order to FA-003: BUY 50 RELIANCE @ Market' },
    { id: 'L005', timestamp: '2024-07-30 11:15:20', level: 'Info', message: 'Master order placed: SELL 50 TCS @ Limit 3900.00' },
    { id: 'L006', timestamp: '2024-07-30 12:05:10', level: 'Warning', message: 'FA-002 approaching daily loss limit. Current loss: -18,540.00' },
    { id: 'L007', timestamp: '2024-07-30 12:10:00', level: 'Intervention', message: 'Trading paused for FA-002. Daily loss limit of 20,000 exceeded.' },
];
