import { User } from '../types';

const AUTH_URL = "https://noppo-auth.noppo5319.workers.dev";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2YXZhc3JkeGd1cWtpaWdjeGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0MTk5ODcsImV4cCI6MjA4Mjk5NTk4N30.CVq3lyRbxek7Ejs4tP5sN9-0JNEXSLtCsC2Pj-skFFQ";

export const authService = {
  login() {
    const currentUrl = encodeURIComponent(window.location.href);
    window.location.href = `${AUTH_URL}?redirect=${currentUrl}`;
  },

  logout() {
    localStorage.removeItem('noppo_user');
    const homeUrl = encodeURIComponent(window.location.origin);
    window.location.href = `${AUTH_URL}/logout?redirect=${homeUrl}`;
  },

  getUser(): User | null {
    const stored = localStorage.getItem('noppo_user');
    return stored ? JSON.parse(stored) : null;
  },

  async checkAuth(): Promise<User | null> {
    const urlParams = new URLSearchParams(window.location.search);
    const ticket = urlParams.get('ticket');

    if (ticket) {
      try {
        const res = await fetch(`${AUTH_URL}/auth/v1/user?ticket=${ticket}`, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_KEY,
            'Content-Type': 'application/json'
          }
        });

        if (res.ok) {
          const user = await res.json();
          const userData = {
            userId: user.userId,
            avatar: user.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${user.email}`,
            email: user.email
          };
          
          localStorage.setItem('noppo_user', JSON.stringify(userData));
          
          // URLからチケットを消して見た目を綺麗にする
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
          
          return userData;
        }
      } catch (e) {
        console.error("認証エラー:", e);
      }
    }
    return this.getUser();
  }
};
