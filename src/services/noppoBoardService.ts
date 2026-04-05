import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyB2HcI-TwH88QDADp-Z5cUFRCsaVO2VMw0",
    authDomain: "portal-1767266387985.firebaseapp.com",
    projectId: "portal-1767266387985",
    storageBucket: "portal-1767266387985.firebasestorage.app",
    messagingSenderId: "931194072772",
    appId: "1:931194072772:web:05d7e925662ddd0f1d6391"
};

const appId = 'noppo-board-premium';

const app = initializeApp(firebaseConfig, 'noppo-board');
const db = getFirestore(app);
const auth = getAuth(app);

export interface Board {
    id: string;
    name: string;
    code: string;
    members: string[];
}

export const noppoBoardService = {
    async fetchBoards(userId: string): Promise<Board[]> {
        // Ensure we are authenticated anonymously as per NoppoBoard HTML
        if (!auth.currentUser) {
            await signInAnonymously(auth);
        }
        const boardsCol = collection(db, 'artifacts', appId, 'public', 'data', 'boards');
        const snap = await getDocs(boardsCol);
        return snap.docs
            .map(d => ({ id: d.id, ...d.data() } as Board))
            .filter(b => (b.members || []).includes(userId));
    },

    async sendToBoard(boardId: string, userId: string, avatar: string, content: string, comment: string): Promise<void> {
        if (!auth.currentUser) {
            await signInAnonymously(auth);
        }
        const postsCol = collection(db, 'artifacts', appId, 'public', 'data', 'boards', boardId, 'posts');
        await addDoc(postsCol, {
            author: userId,
            avatar: avatar,
            content: `${comment}\n\n---\n\n${content}`,
            type: 'post',
            createdAt: serverTimestamp()
        });
    }
};
