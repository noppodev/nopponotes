import Peer, { DataConnection } from 'peerjs';

const CHUNK_SIZE = 16384 * 4;

export class NoppoDTService {
    private peer: Peer | null = null;
    private activeConn: DataConnection | null = null;

    init(userId: string, onOpen: (id: string) => void, onConnection: (conn: DataConnection) => void) {
        const id = `noppo-${userId.toLowerCase().replace(/[^a-z0-9-]/g, '')}`;
        this.peer = new Peer(id, {
            debug: 1,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        });

        this.peer.on('open', (id) => onOpen(id));
        this.peer.on('connection', (conn) => {
            this.activeConn = conn;
            onConnection(conn);
        });
        
        this.peer.on('error', (err) => {
            console.error('PeerJS Error:', err);
        });
    }

    connect(targetId: string, onOpen: () => void): DataConnection {
        if (!this.peer) throw new Error('Peer not initialized');
        const conn = this.peer.connect(targetId, { reliable: true });
        this.activeConn = conn;
        conn.on('open', onOpen);
        return conn;
    }

    async sendNote(title: string, content: string, onProgress: (pct: number) => void): Promise<void> {
        if (!this.activeConn || !this.activeConn.open) throw new Error('No active connection');

        const fileId = 'f' + Math.random().toString(36).substr(2, 9);
        const encoder = new TextEncoder();
        const data = encoder.encode(content);
        const totalChunks = Math.ceil(data.byteLength / CHUNK_SIZE);

        this.activeConn.send({
            type: 'file-start',
            fileId,
            name: `${title || 'note'}.txt`,
            mime: 'text/plain',
            totalChunks
        });

        for (let i = 0; i < totalChunks; i++) {
            if ((this.activeConn as any).bufferSize > CHUNK_SIZE * 20) {
                await new Promise(r => setTimeout(r, 50));
                i--;
                continue;
            }

            const chunk = data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            this.activeConn.send({
                type: 'file-chunk',
                fileId,
                index: i,
                chunk
            });

            onProgress(Math.floor(((i + 1) / totalChunks) * 100));
        }
    }

    destroy() {
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.activeConn = null;
    }
}

export const noppoDTService = new NoppoDTService();
