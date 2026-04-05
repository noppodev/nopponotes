import { Note } from '../types';

const CONFIG = {
  FIREBASE: {
    apiKey: "AIzaSyAwe9BsUFXA4MdzYYuekNsLo320MHqfXww",
    projectId: "tribal-bonsai-470002-u0",
    appId: "noppo-drive-ultimate"
  },
  WORKER_URL: "https://drive-api.noppo5319.workers.dev/"
};

interface DriveItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string | null;
  url: string;
  size: number;
  is_deleted: boolean;
  is_starred: boolean;
  children?: DriveItem[];
}

class DriveService {
  private idToken: string | null = null;

  private async getAuthToken() {
    if (this.idToken) return this.idToken;

    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${CONFIG.FIREBASE.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnSecureToken: true })
      }
    );
    const data = await res.json();
    if (!data.idToken) throw new Error("認証に失敗しました");
    this.idToken = data.idToken;
    return this.idToken;
  }

  async fetchTree(): Promise<DriveItem[]> {
    const res = await fetch(CONFIG.WORKER_URL);
    if (!res.ok) throw new Error("データの取得に失敗しました");
    return await res.json();
  }

  private findFolder(tree: DriveItem[], name: string): DriveItem | null {
    for (const item of tree) {
      if (item.type === 'folder' && item.name === name) return item;
      if (item.children) {
        const found = this.findFolder(item.children, name);
        if (found) return found;
      }
    }
    return null;
  }

  async getNotesFolderId(): Promise<string> {
    const tree = await this.fetchTree();
    const folder = this.findFolder(tree, "Notes");
    if (folder) return folder.id;

    // フォルダがない場合は作成
    return await this.createItem("Notes", "folder", null);
  }

  async createItem(name: string, type: 'file' | 'folder', parentId: string | null, content: string = ""): Promise<string> {
    const token = await this.getAuthToken();
    const url = `https://firestore.googleapis.com/v1/projects/${CONFIG.FIREBASE.projectId}/databases/(default)/documents/artifacts/${CONFIG.FIREBASE.appId}/public/data/items`;
    
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields: {
          name: { stringValue: name },
          type: { stringValue: type },
          parentId: { stringValue: parentId || "" },
          url: { stringValue: content },
          size: { integerValue: content.length.toString() },
          is_deleted: { booleanValue: false },
          is_starred: { booleanValue: false }
        }
      })
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.name.split('/').pop();
  }

  async updateNote(note: Note): Promise<void> {
    const token = await this.getAuthToken();
    const url = `https://firestore.googleapis.com/v1/projects/${CONFIG.FIREBASE.projectId}/databases/(default)/documents/artifacts/${CONFIG.FIREBASE.appId}/public/data/items/${note.id}?updateMask.fieldPaths=name&updateMask.fieldPaths=url&updateMask.fieldPaths=is_starred&updateMask.fieldPaths=category&updateMask.fieldPaths=tags`;
    
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields: {
          name: { stringValue: note.title },
          url: { stringValue: note.content },
          is_starred: { booleanValue: note.isFavorite },
          category: { stringValue: note.category || "Notes" },
          tags: { arrayValue: { values: (note.tags || []).map(t => ({ stringValue: t })) } }
        }
      })
    });

    if (!res.ok) throw new Error("更新に失敗しました");
  }

  async deleteNote(id: string): Promise<void> {
    const token = await this.getAuthToken();
    const url = `https://firestore.googleapis.com/v1/projects/${CONFIG.FIREBASE.projectId}/databases/(default)/documents/artifacts/${CONFIG.FIREBASE.appId}/public/data/items/${id}?updateMask.fieldPaths=is_deleted`;
    
    await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        fields: {
          is_deleted: { booleanValue: true }
        }
      })
    });
  }

  async fetchNotes(): Promise<Note[]> {
    const tree = await this.fetchTree();
    const notesFolder = this.findFolder(tree, "Notes");
    if (!notesFolder || !notesFolder.children) return [];

    return notesFolder.children
      .filter(item => item.type === 'file')
      .map(item => {
        const anyItem = item as any;
        return {
          id: item.id,
          title: item.name,
          content: item.url,
          category: anyItem.category || "Notes",
          tags: anyItem.tags || [],
          lastEdited: "同期済み",
          isFavorite: item.is_starred
        };
      });
  }
}

export const driveService = new DriveService();
