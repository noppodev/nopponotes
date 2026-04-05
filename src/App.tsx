/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Search, 
  Filter, 
  Plus, 
  FileText, 
  Star, 
  LayoutGrid, 
  ArrowLeft, 
  MoreVertical, 
  Bold,
  Italic,
  Underline,
  List,
  Quote,
  Image as ImageIcon,
  Link as LinkIcon, 
  Trash2,
  Heart,
  Lightbulb,
  Briefcase,
  Wallet,
  Check,
  Loader2,
  Tag,
  X,
  Calendar,
  Share2,
  Printer,
  Send,
  Smartphone,
  Copy,
  QrCode,
  Zap
} from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Note, User, View } from './types';
import { driveService } from './services/driveService';
import { authService } from './services/authService';
import { noppoBoardService, Board } from './services/noppoBoardService';
import { noppoDTService } from './services/noppoDTService';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('notes');
  const [notes, setNotes] = useState<Note[]>([]);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title'>('date');
  const [user, setUser] = useState<User | null>(authService.getUser());

  // 認証チェック
  useEffect(() => {
    const check = async () => {
      const authUser = await authService.checkAuth();
      if (authUser) {
        setUser(authUser);
      }
    };
    check();
  }, []);

  // ネイティブでアプリ起動中にカスタムスキームで開かれたときの処理
  useEffect(() => {
    let handler: any = null;
    try {
      handler = CapacitorApp.addListener('appUrlOpen', (event: any) => {
        try {
          const url = new URL(event.url);
          const token = url.searchParams.get('token') || url.searchParams.get('ticket');
          if (token) {
            (async () => {
              const authUser = await authService.handleIncomingToken(token);
              if (authUser) {
                setUser(authUser);
                setCurrentView('notes');
              }
            })();
          }
        } catch (e) {
          console.error('appUrlOpen URL parse error:', e);
        }
      });
    } catch (e) {
      // Capacitor App プラグインが無い／ブラウザ環境など
      // console.warn('Capacitor App listener not available', e);
    }

    return () => {
      if (handler && typeof handler.remove === 'function') handler.remove();
    };
  }, []);

  // ページ遷移時にトップへスクロール
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentView]);

  // データの初期読み込み
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    
    const init = async () => {
      try {
        setLoading(true);
        await driveService.getNotesFolderId();
        const fetchedNotes = await driveService.fetchNotes();
        setNotes(fetchedNotes);
      } catch (err) {
        console.error("初期化エラー:", err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [user]);

  const handleLogin = () => authService.login();
  const handleLogout = () => authService.logout();

  const handleEditNote = (note: Note) => {
    setEditingNote(note);
    setCurrentView('editor');
  };

  const handleNewNote = () => {
    const newNote: Note = {
      id: '', // 新規作成時は空
      title: '',
      content: '',
      category: 'Notes',
      tags: [],
      lastEdited: '新規',
      isFavorite: false
    };
    setEditingNote(newNote);
    setCurrentView('editor');
  };

  const handleToggleFavorite = async (id: string) => {
    const note = notes.find(n => n.id === id);
    if (!note) return;

    const newStatus = !note.isFavorite;
    
    // Optimistic Update
    setNotes(prev => prev.map(n => n.id === id ? { ...n, isFavorite: newStatus } : n));
    setSyncing(true);

    try {
      await driveService.updateNote({ ...note, isFavorite: newStatus });
    } catch (err) {
      console.error("お気に入り更新エラー:", err);
      // Rollback
      setNotes(prev => prev.map(n => n.id === id ? { ...n, isFavorite: !newStatus } : n));
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!id) {
      setEditingNote(null);
      setCurrentView('notes');
      return;
    }

    // Optimistic Delete
    const originalNotes = [...notes];
    setNotes(prev => prev.filter(n => n.id !== id));
    setEditingNote(null);
    setCurrentView('notes');
    setSyncing(true);

    try {
      await driveService.deleteNote(id);
    } catch (err) {
      console.error("削除エラー:", err);
      setNotes(originalNotes);
      alert("削除の同期に失敗しました。");
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveNote = async (updatedNote: Note) => {
    const isNew = updatedNote.id === '';
    const tempId = isNew ? `temp-${Date.now()}` : updatedNote.id;
    const noteToSave = { ...updatedNote, id: tempId };

    // Optimistic Update
    setNotes(prev => {
      if (isNew) return [noteToSave, ...prev];
      return prev.map(n => n.id === updatedNote.id ? noteToSave : n);
    });
    setEditingNote(null);
    setCurrentView('notes');
    setSyncing(true);

    try {
      if (isNew) {
        const folderId = await driveService.getNotesFolderId();
        const realId = await driveService.createItem(updatedNote.title, 'file', folderId, updatedNote.content);
        setNotes(prev => prev.map(n => n.id === tempId ? { ...n, id: realId } : n));
      } else {
        await driveService.updateNote(updatedNote);
      }
    } catch (err) {
      console.error("保存エラー:", err);
      alert("同期に失敗しました。再試行してください。");
    } finally {
      setSyncing(false);
    }
  };

  const filteredNotes = useMemo(() => {
    let result = notes.filter(note => 
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (note.tags && note.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase())))
    );

    if (sortBy === 'title') {
      result.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      // Simple ID sort as proxy for date for now
      result.sort((a, b) => b.id.localeCompare(a.id));
    }

    return result;
  }, [notes, searchQuery, sortBy]);

  const renderView = () => {
    if (!user) {
      return (
        <div className="flex flex-col items-center justify-center h-screen px-6 text-center">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-8">
            <FileText size={48} className="text-primary" />
          </div>
          <h1 className="text-4xl font-headline font-extrabold mb-4">NoppoNotes</h1>
          <p className="text-on-surface-variant mb-12 max-w-xs font-medium">
            NoppoStudioのメモアプリ
          </p>
          <button 
            onClick={handleLogin}
            className="w-full max-w-xs py-4 bg-primary text-on-primary rounded-full font-bold text-lg shadow-xl shadow-primary/20 active:scale-95 transition-transform"
          >
            サインインして始める
          </button>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-[80vh] text-primary">
          <Loader2 className="animate-spin mb-4" size={48} />
          <p className="font-medium">NoppoDriveと同期中...</p>
        </div>
      );
    }

    switch (currentView) {
      case 'notes':
        return (
          <NoteListView 
            notes={filteredNotes} 
            onEdit={handleEditNote} 
            onNew={handleNewNote} 
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onToggleFavorite={handleToggleFavorite}
            user={user}
            onLogout={handleLogout}
            syncing={syncing}
            sortBy={sortBy}
            setSortBy={setSortBy}
          />
        );
      case 'calendar':
        return <CalendarView notes={notes} onEdit={handleEditNote} />;
      case 'favorites':
        return (
          <FavoritesView 
            notes={filteredNotes.filter(n => n.isFavorite)} 
            onEdit={handleEditNote} 
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        );
      case 'categories':
        return <CategoriesView notes={notes} />;
      case 'editor':
        return (
          <NoteEditorView 
            note={editingNote} 
            onBack={() => setCurrentView('notes')} 
            onDelete={handleDeleteNote}
            onToggleFavorite={handleToggleFavorite}
            onSave={handleSaveNote}
            user={user}
          />
        );
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-surface">
      <main className="flex-1 overflow-y-auto no-scrollbar relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </main>

      {currentView !== 'editor' && !loading && user && (
        <nav className="fixed bottom-0 left-0 w-full bg-surface-container-lowest/70 backdrop-blur-[30px] px-4 pt-2 pb-8 flex justify-around items-center z-50 rounded-t-xl shadow-[0_-8px_32px_rgba(0,101,148,0.08)]">
          <NavButton 
            active={currentView === 'notes'} 
            onClick={() => setCurrentView('notes')} 
            icon={<FileText size={24} />} 
            label="ノート" 
          />
          <NavButton 
            active={currentView === 'calendar'} 
            onClick={() => setCurrentView('calendar')} 
            icon={<Calendar size={24} />} 
            label="カレンダー" 
          />
          <NavButton 
            active={currentView === 'favorites'} 
            onClick={() => setCurrentView('favorites')} 
            icon={<Star size={24} />} 
            label="お気に入り" 
          />
          <NavButton 
            active={currentView === 'categories'} 
            onClick={() => setCurrentView('categories')} 
            icon={<LayoutGrid size={24} />} 
            label="カテゴリ" 
          />
        </nav>
      )}

      {currentView === 'notes' && !loading && user && (
        <div className="fixed bottom-24 right-6 z-40">
          <button 
            onClick={handleNewNote}
            className="w-16 h-16 rounded-full liquid-glass shadow-xl shadow-primary/10 flex items-center justify-center text-primary hover:scale-110 active:scale-95 transition-transform group"
          >
            <Plus size={32} className="group-hover:rotate-90 transition-transform duration-300" />
          </button>
        </div>
      )}
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center justify-center px-5 py-2 rounded-2xl transition-all ${
        active ? 'bg-primary-container/30 text-primary' : 'text-on-surface-variant/60 hover:bg-surface-container-low'
      }`}
    >
      <div className={active ? 'fill-current' : ''}>{icon}</div>
      <span className="font-body text-[11px] font-medium mt-1">{label}</span>
    </button>
  );
}

function NoteListView({ notes, onEdit, onNew, searchQuery, setSearchQuery, onToggleFavorite, user, onLogout, syncing, sortBy, setSortBy }: { 
  notes: Note[], 
  onEdit: (n: Note) => void, 
  onNew: () => void,
  searchQuery: string,
  setSearchQuery: (s: string) => void,
  onToggleFavorite: (id: string) => void,
  user: User | null,
  onLogout: () => void,
  syncing: boolean,
  sortBy: 'date' | 'title',
  setSortBy: (s: 'date' | 'title') => void
}) {
  return (
    <div className="px-6 pt-4 pb-32 max-w-5xl mx-auto">
      <header className="flex justify-between items-center py-4 mb-8">
        <div className="flex items-center gap-3">
          {user && (
            <img 
              src={user.avatar} 
              alt="avatar" 
              className="w-8 h-8 rounded-full border border-outline-variant"
              onClick={onLogout}
            />
          )}
          <h1 className="text-xl font-headline font-bold tracking-tight">NoppoNotes</h1>
        </div>
        <div className="flex gap-2">
          <button className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-primary"><Search size={20} /></button>
          <button className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-primary"><Filter size={20} /></button>
        </div>
      </header>

      <div className="mb-12">
        <h2 className="text-5xl font-headline font-extrabold tracking-tight mb-6">アーカイブ</h2>
        <div className="relative group mb-8">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-on-surface-variant/50">
            <Search size={20} />
          </div>
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="思考を検索..." 
            className="w-full bg-surface-container-high border-none rounded-full py-5 pl-14 pr-6 focus:ring-2 focus:ring-primary/20 text-lg font-medium transition-all placeholder:text-on-surface-variant/40"
          />
        </div>
        <p className="text-on-surface-variant font-medium">{notes.length}件のノートが見つかりました</p>
      </div>

      {notes.length === 0 ? (
        <div className="text-center py-20 bg-surface-container-low rounded-xl border-2 border-dashed border-outline-variant/30">
          <p className="text-on-surface-variant">ノートがありません。新しいノートを作成しましょう！</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {notes.map((note, idx) => {
            const isLarge = idx === 0;
            return (
              <div 
                key={note.id} 
                onClick={() => onEdit(note)}
                className={`${isLarge ? 'md:col-span-8' : 'md:col-span-4'} group cursor-pointer`}
              >
                <div className={`rounded-xl h-full flex flex-col transition-all duration-500 ${
                  isLarge 
                    ? 'bg-surface-container-lowest p-8 border border-white/20 hover:shadow-[0_20px_50px_rgba(0,101,148,0.1)]' 
                    : 'bg-surface-container-low p-6 hover:bg-surface-container-high'
                }`}>
                  {note.imageUrl && isLarge && (
                    <div className="mb-6 rounded-xl overflow-hidden h-48">
                      <img src={note.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    </div>
                  )}
                  
                  <div className="flex justify-between items-start mb-4">
                    <span className="px-3 py-1 bg-primary-container/30 text-on-primary-container text-[10px] font-bold rounded-full tracking-wider uppercase">
                      {note.category}
                    </span>
                    <span className="text-[11px] font-medium text-on-surface-variant/60">{note.lastEdited}</span>
                  </div>

                  <h3 className={`${isLarge ? 'text-3xl' : 'text-xl'} font-headline font-bold mb-4 leading-tight`}>
                    {note.title || '無題のノート'}
                  </h3>
                  
                  <p className="text-on-surface-variant text-sm leading-relaxed line-clamp-3 mb-6">
                    {note.content}
                  </p>

                  <div className="mt-auto flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {note.isFavorite && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(note.id);
                          }}
                          className="text-primary"
                        >
                          <Star size={14} className="fill-current" />
                        </button>
                      )}
                    </div>
                    <MoreVertical size={16} className="text-on-surface-variant/30" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FavoritesView({ notes, onEdit, searchQuery, setSearchQuery }: { notes: Note[], onEdit: (n: Note) => void, searchQuery: string, setSearchQuery: (s: string) => void }) {
  return (
    <div className="px-6 pt-4 pb-32 max-w-5xl mx-auto">
      <header className="py-4 mb-8">
        <h1 className="text-3xl font-headline font-extrabold tracking-tight">お気に入り</h1>
        <p className="text-on-surface-variant/60 font-medium">大切な思考のコレクション</p>
      </header>
      
      <div className="mb-8">
        <input 
          type="text" 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="お気に入りを検索..." 
          className="w-full bg-surface-container-high border-none rounded-full py-4 px-6 focus:ring-2 focus:ring-primary/20 text-lg font-medium transition-all"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {notes.map(note => (
          <NoteCard key={note.id} note={note} onClick={() => onEdit(note)} />
        ))}
      </div>
    </div>
  );
}

function CategoriesView({ notes }: { notes: Note[] }) {
  const categories = [
    { name: '仕事', icon: <Briefcase size={24} />, count: notes.filter(n => n.category === '仕事').length, color: 'bg-primary/10 text-primary' },
    { name: '個人', icon: <Heart size={24} />, count: notes.filter(n => n.category === '個人').length, color: 'bg-tertiary-container/40 text-on-tertiary-container' },
    { name: 'アイデア', icon: <Lightbulb size={24} />, count: notes.filter(n => n.category === 'アイデア').length, color: 'bg-secondary-container/60 text-on-secondary-container' },
    { name: '財務', icon: <Wallet size={24} />, count: notes.filter(n => n.category === '財務').length, color: 'bg-surface-container-highest text-primary' },
  ];

  return (
    <div className="px-6 pt-4 pb-32 max-w-4xl mx-auto">
      <header className="flex justify-between items-center py-4 mb-10">
        <button className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-primary"><Search size={20} /></button>
        <h1 className="text-xl font-headline font-bold tracking-tight">NoppoNotes</h1>
        <button className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-primary"><Filter size={20} /></button>
      </header>

      <header className="mb-10">
        <h1 className="font-headline text-5xl font-extrabold tracking-tight mb-2">カテゴリ</h1>
        <p className="text-on-surface-variant text-lg">思考を流動的な空間に整理しましょう。</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {categories.map((cat, idx) => (
          <div 
            key={cat.name}
            className={`${idx === 0 ? 'md:col-span-8' : 'md:col-span-4'} bg-surface-container-low rounded-xl p-8 liquid-glass relative overflow-hidden flex flex-col justify-between min-h-[220px]`}
          >
            <div className="z-10">
              <div className="flex justify-between items-start">
                <div className={`${cat.color} p-4 rounded-xl mb-4`}>
                  {cat.icon}
                </div>
                <span className="text-on-surface-variant font-medium text-sm">{cat.count}件のノート</span>
              </div>
              <h2 className="text-2xl font-bold font-headline mb-1">{cat.name}</h2>
              <p className="text-on-surface-variant font-medium opacity-70">プロジェクトの下書き、会議録など。</p>
            </div>
          </div>
        ))}
        
        <button className="md:col-span-4 bg-primary text-on-primary rounded-xl p-8 flex flex-col items-center justify-center gap-4 transition-transform hover:scale-[1.02] active:scale-95">
          <div className="bg-on-primary/20 p-3 rounded-full">
            <Plus size={32} />
          </div>
          <span className="font-bold text-lg">カテゴリを追加</span>
        </button>

        <div className="md:col-span-12 rounded-xl overflow-hidden relative h-40 mt-6">
          <img 
            src="https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&q=80&w=1200" 
            alt="" 
            className="w-full h-full object-cover opacity-60 mix-blend-multiply" 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent"></div>
          <div className="absolute bottom-6 left-8">
            <h3 className="font-headline font-bold text-xl text-on-surface">アーカイブ</h3>
            <p className="text-on-surface-variant text-sm">過去の思考の保管庫にアクセス</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function NoteEditorView({ note, onBack, onSave, onDelete, onToggleFavorite, user }: { 
  note: Note | null, 
  onBack: () => void, 
  onSave: (n: Note) => void,
  onDelete: (id: string) => void,
  onToggleFavorite: (id: string) => void,
  user: User
}) {
  const [title, setTitle] = useState(note?.title || '');
  const [category, setCategory] = useState(note?.category || 'Notes');
  const [tags, setTags] = useState<string[]>(note?.tags || []);
  const [newTag, setNewTag] = useState('');
  const [isFavorite, setIsFavorite] = useState(note?.isFavorite || false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showNoppoBoardDialog, setShowNoppoBoardDialog] = useState(false);
  const [showNoppoDTDialog, setShowNoppoDTDialog] = useState(false);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [shareComment, setShareComment] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  
  // NoppoDT State
  const [myPeerId, setMyPeerId] = useState('Initializing...');
  const [targetPeerId, setTargetPeerId] = useState('');
  const [dtStatus, setDtStatus] = useState<'idle' | 'connecting' | 'linked' | 'sending' | 'done'>('idle');
  const [dtProgress, setDtProgress] = useState(0);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: '思考を書き留める...',
      }),
    ],
    content: note?.content || '',
    editorProps: {
      attributes: {
        class: 'prose prose-slate max-w-none focus:outline-none min-h-[500px] text-lg leading-relaxed text-on-surface',
      },
    },
  });

  useEffect(() => {
    if (showNoppoBoardDialog && user) {
      noppoBoardService.fetchBoards(user.userId).then(setBoards);
    }
  }, [showNoppoBoardDialog, user]);

  useEffect(() => {
    if (showNoppoDTDialog && user) {
      noppoDTService.init(user.userId, (id) => {
        setMyPeerId(id);
      }, (conn) => {
        setDtStatus('linked');
      });
    }
    return () => {
      if (showNoppoDTDialog) noppoDTService.destroy();
    };
  }, [showNoppoDTDialog, user]);

  useEffect(() => {
    const handleVisualViewportResize = () => {
      if (window.visualViewport) {
        const height = window.innerHeight - window.visualViewport.height;
        setKeyboardHeight(height > 0 ? height : 0);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportResize);
      window.visualViewport.addEventListener('scroll', handleVisualViewportResize);
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportResize);
        window.visualViewport.removeEventListener('scroll', handleVisualViewportResize);
      }
    };
  }, []);

  const handleSave = () => {
    const content = editor?.getHTML() || '';
    onSave({
      ...(note || { id: '' }),
      title,
      content,
      category,
      tags,
      isFavorite,
      lastEdited: 'たった今'
    } as Note);
  };

  const toggleFormat = (format: string) => {
    if (!editor) return;
    if (format === 'bold') editor.chain().focus().toggleBold().run();
    if (format === 'italic') editor.chain().focus().toggleItalic().run();
    if (format === 'bulletList') editor.chain().focus().toggleBulletList().run();
    if (format === 'blockquote') editor.chain().focus().toggleBlockquote().run();
  };

  const handleShareToNoppoBoard = async () => {
    if (!selectedBoardId || !user || !editor) return;
    setIsSharing(true);
    try {
      await noppoBoardService.sendToBoard(selectedBoardId, user.userId, user.avatar, editor.getText(), shareComment);
      alert("NoppoBoardに送信しました");
      setShowNoppoBoardDialog(false);
      setShareComment('');
    } catch (e) {
      alert("送信に失敗しました");
    } finally {
      setIsSharing(false);
    }
  };

  const handleNoppoDTConnect = () => {
    if (!targetPeerId) return;
    setDtStatus('connecting');
    noppoDTService.connect(targetPeerId, () => {
      setDtStatus('linked');
    });
  };

  const handleNoppoDTSend = async () => {
    if (!editor) return;
    setDtStatus('sending');
    try {
      await noppoDTService.sendNote(title, editor.getText(), (pct) => {
        setDtProgress(pct);
      });
      setDtStatus('done');
      setTimeout(() => setDtStatus('linked'), 2000);
    } catch (e) {
      alert("送信に失敗しました");
      setDtStatus('linked');
    }
  };

  const addTag = () => {
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleToggleFav = () => {
    setIsFavorite(!isFavorite);
    if (note?.id) {
      onToggleFavorite(note.id);
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="w-full sticky top-0 z-50 bg-surface/60 backdrop-blur-xl flex justify-between items-center px-6 py-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="hover:bg-surface-container-low transition-colors p-2 rounded-xl active:scale-95">
            <ArrowLeft size={24} className="text-primary" />
          </button>
          <h1 className="text-xl font-bold font-headline tracking-tight">NoppoNotes</h1>
        </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button 
                onClick={() => setShowShareMenu(!showShareMenu)}
                className="hover:bg-surface-container-low transition-colors p-2 rounded-xl active:scale-95"
              >
                <Share2 size={24} className="text-primary" />
              </button>
              
              <AnimatePresence>
                {showShareMenu && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-56 bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/10 p-2 z-[110]"
                  >
                    <button 
                      onClick={() => {
                        setShowNoppoBoardDialog(true);
                        setShowShareMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container-low rounded-xl text-sm font-medium transition-colors text-on-surface"
                    >
                      <Send size={18} className="text-blue-500" />
                      NoppoBoardで送る
                    </button>
                    <button 
                      onClick={() => {
                        setShowNoppoDTDialog(true);
                        setShowShareMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-container-low rounded-xl text-sm font-medium transition-colors text-on-surface"
                    >
                      <Smartphone size={18} className="text-primary" />
                      NoppoDTで送る
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button 
              onClick={handleSave}
              className="px-5 py-2 bg-primary text-on-primary rounded-full font-semibold text-sm hover:bg-primary-dim transition-colors active:scale-95"
            >
              完了
            </button>
          </div>
      </header>

      <main className="pt-4 pb-40 px-6 max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
            <div className="flex items-center gap-1 bg-surface-container-low px-3 py-1.5 rounded-full border border-outline-variant/10">
              <LayoutGrid size={14} className="text-primary" />
              <select 
                value={category} 
                onChange={(e) => setCategory(e.target.value)}
                className="bg-transparent border-none text-xs font-bold focus:ring-0 p-0 text-on-surface"
              >
                <option value="Notes">ノート</option>
                <option value="Work">仕事</option>
                <option value="Personal">個人</option>
                <option value="Ideas">アイデア</option>
                <option value="Finance">金融</option>
              </select>
            </div>
            
            {tags.map(tag => (
              <span key={tag} className="flex items-center gap-1 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-xs font-bold border border-primary/20">
                <Tag size={12} />
                {tag}
                <button onClick={() => removeTag(tag)} className="hover:text-error"><X size={12} /></button>
              </span>
            ))}
            
            <div className="flex items-center gap-1 bg-surface-container-low px-3 py-1.5 rounded-full border border-outline-variant/10 min-w-[100px]">
              <Tag size={12} className="text-on-surface-variant/40" />
              <input 
                type="text" 
                placeholder="タグ追加..." 
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTag()}
                className="bg-transparent border-none text-xs font-medium focus:ring-0 p-0 w-full"
              />
            </div>
          </div>
          <div className="flex gap-4 items-center">
            <button 
              onClick={handleToggleFav}
              className={`p-2 rounded-full transition-colors ${isFavorite ? 'text-primary' : 'text-on-surface-variant/40'}`}
            >
              <Star size={24} className={isFavorite ? 'fill-current' : ''} />
            </button>
            {note?.id && (
              <button 
                onClick={() => onDelete(note.id)}
                className="p-2 rounded-full text-red-500/60 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={24} />
              </button>
            )}
          </div>
        </div>

        <section className="space-y-6">
          <input 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent border-none focus:ring-0 text-4xl md:text-5xl font-extrabold font-headline text-on-surface placeholder:text-surface-container-high p-0 tracking-tight" 
            placeholder="タイトルを入力..." 
          />
          
          <div className="mt-12 bg-surface-container-lowest rounded-3xl p-6 md:p-10 shadow-sm min-h-[600px] border border-outline-variant/5">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center justify-between mb-8 border-b border-outline-variant/10 pb-4">
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">Editor</p>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] text-on-surface-variant/40 font-medium">WYSIWYG Mode</span>
                </div>
              </div>
              <EditorContent editor={editor} />
            </div>
          </div>
            {note?.imageUrl && (
              <div className="mt-8 rounded-xl overflow-hidden relative group">
                <img src={note.imageUrl} alt="" className="w-full h-80 object-cover rounded-xl" />
              </div>
            )}
          </section>
        </main>

      <div 
        className="fixed left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-xl transition-all duration-200"
        style={{ bottom: keyboardHeight > 0 ? `${keyboardHeight + 16}px` : '32px' }}
      >
        <div className="liquid-glass rounded-full px-6 py-3 flex items-center justify-between shadow-[0_12px_48px_rgba(0,101,148,0.12)]">
          <div className="flex items-center gap-1">
            <ToolbarButton onClick={() => toggleFormat('bold')} icon={<Bold size={20} />} />
            <ToolbarButton onClick={() => toggleFormat('italic')} icon={<Italic size={20} />} />
          </div>
          <div className="h-6 w-[1px] bg-on-surface-variant/10 mx-2"></div>
          <div className="flex items-center gap-1">
            <ToolbarButton onClick={() => toggleFormat('bulletList')} icon={<List size={20} />} />
            <ToolbarButton onClick={() => toggleFormat('blockquote')} icon={<Quote size={20} />} />
          </div>
          <div className="h-6 w-[1px] bg-on-surface-variant/10 mx-2"></div>
          <div className="flex items-center gap-1">
            <ToolbarButton icon={<ImageIcon size={20} />} />
            <ToolbarButton icon={<LinkIcon size={20} />} />
            <button 
              onClick={handleSave}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-primary text-on-primary shadow-lg shadow-primary/20 transition-all active:scale-90"
            >
              <Check size={24} />
            </button>
          </div>
        </div>
      </div>

      {/* NoppoBoard Dialog */}
      <AnimatePresence>
        {showNoppoBoardDialog && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNoppoBoardDialog(false)}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-surface-container-lowest rounded-[40px] w-full max-w-md relative p-10 shadow-2xl border border-outline-variant/10 z-[210]"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-slate-950 rounded-2xl flex items-center justify-center text-white">
                  <Send size={18} />
                </div>
                <h3 className="text-2xl font-black font-headline">NoppoBoardで送る</h3>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2 block">スペースを選択</label>
                  <select 
                    value={selectedBoardId}
                    onChange={(e) => setSelectedBoardId(e.target.value)}
                    className="w-full bg-surface-container-low border-none rounded-2xl py-4 px-6 font-bold focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">選択してください</option>
                    {boards.map(b => (
                      <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2 block">コメント</label>
                  <textarea 
                    value={shareComment}
                    onChange={(e) => setShareComment(e.target.value)}
                    placeholder="コメントを追加..."
                    className="w-full bg-surface-container-low border-none rounded-2xl py-4 px-6 h-32 resize-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 mt-8">
                <button 
                  onClick={handleShareToNoppoBoard}
                  disabled={!selectedBoardId || isSharing}
                  className="w-full py-4 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50"
                >
                  {isSharing ? '送信中...' : '送信する'}
                </button>
                <button 
                  onClick={() => setShowNoppoBoardDialog(false)}
                  className="py-2 text-[10px] font-black text-slate-300 uppercase"
                >
                  キャンセル
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* NoppoDT Dialog */}
      <AnimatePresence>
        {showNoppoDTDialog && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNoppoDTDialog(false)}
              className="absolute inset-0 bg-on-surface/20 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-surface-container-lowest rounded-[40px] w-full max-w-md relative p-8 shadow-2xl border border-outline-variant/10 z-[210] overflow-hidden"
            >
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white">
                  <Smartphone size={18} />
                </div>
                <div>
                  <h3 className="text-xl font-black font-headline">Noppo DT</h3>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Direct Transfer</p>
                </div>
              </div>

              <div className="space-y-8">
                <div className="text-center p-6 bg-surface-container-low rounded-3xl border border-outline-variant/5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Your ID</p>
                  <div className="flex items-center justify-center gap-3">
                    <span className="font-mono font-bold text-lg tracking-tight">{myPeerId}</span>
                    <button onClick={() => navigator.clipboard.writeText(myPeerId)} className="text-slate-300 hover:text-primary transition-colors">
                      <Copy size={16} />
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Connect</p>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${dtStatus === 'linked' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{dtStatus}</span>
                    </div>
                  </div>
                  
                  <div className="relative">
                    <input 
                      type="text" 
                      value={targetPeerId}
                      onChange={(e) => setTargetPeerId(e.target.value)}
                      placeholder="相手のIDを入力"
                      className="w-full bg-surface-container-low border-none rounded-2xl py-4 px-6 font-bold focus:ring-2 focus:ring-primary/20"
                    />
                    <button className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-primary transition-colors">
                      <QrCode size={20} />
                    </button>
                  </div>

                  <button 
                    onClick={handleNoppoDTConnect}
                    disabled={dtStatus === 'linked' || dtStatus === 'connecting'}
                    className="w-full py-4 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50"
                  >
                    {dtStatus === 'connecting' ? '接続中...' : dtStatus === 'linked' ? '接続済み' : 'デバイスを接続'}
                  </button>
                </div>

                {dtStatus === 'linked' || dtStatus === 'sending' || dtStatus === 'done' ? (
                  <div className="pt-4 border-t border-outline-variant/10">
                    <button 
                      onClick={handleNoppoDTSend}
                      disabled={dtStatus === 'sending'}
                      className="w-full py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
                    >
                      {dtStatus === 'sending' ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          {dtProgress}% 送信中
                        </>
                      ) : dtStatus === 'done' ? (
                        <>
                          <Check size={16} />
                          送信完了
                        </>
                      ) : (
                        <>
                          <Zap size={16} />
                          ノートを送信
                        </>
                      )}
                    </button>
                  </div>
                ) : null}
              </div>

              <button 
                onClick={() => setShowNoppoDTDialog(false)}
                className="w-full mt-6 py-2 text-[10px] font-black text-slate-300 uppercase"
              >
                閉じる
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NoteCard({ note, onClick }: { note: Note, onClick: () => void, key?: string }) {
  return (
    <div 
      onClick={onClick}
      className="bg-surface-container-low rounded-xl p-6 liquid-glass relative overflow-hidden group cursor-pointer active:scale-[0.98] transition-all"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-primary/10 rounded-xl text-primary">
          <FileText size={24} />
        </div>
        {note.isFavorite && <Star size={18} className="text-primary fill-current" />}
      </div>
      <div>
        <div className="flex items-center gap-3 mb-4">
          <span className="px-3 py-1 rounded-full bg-primary-container/30 text-on-primary-container text-[10px] font-bold tracking-widest uppercase">{note.category}</span>
          <span className="text-[11px] text-on-surface-variant/60 font-medium">{note.lastEdited}</span>
        </div>
        <h3 className="text-2xl font-headline font-bold mb-3 leading-tight">{note.title || "無題のノート"}</h3>
        <p className="text-on-surface-variant text-sm leading-relaxed line-clamp-3">{note.content}</p>
        
        {note.tags && note.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {note.tags.map(tag => (
              <span key={tag} className="text-[10px] font-bold text-primary/60 bg-primary/5 px-2 py-0.5 rounded-full">#{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CalendarView({ notes, onEdit }: { notes: Note[], onEdit: (n: Note) => void }) {
  return (
    <div className="px-6 pt-4 pb-32 max-w-5xl mx-auto">
      <header className="py-4 mb-8">
        <h1 className="text-3xl font-headline font-extrabold tracking-tight">カレンダー</h1>
        <p className="text-on-surface-variant/60 font-medium">日付ごとの思考の記録</p>
      </header>
      
      <div className="grid gap-6">
        {['今日', '昨日', '今週', '以前'].map(period => (
          <div key={period}>
            <h2 className="text-sm font-bold text-primary mb-4 px-2">{period}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {notes.slice(0, 2).map(note => (
                <NoteCard key={note.id} note={note} onClick={() => onEdit(note)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolbarButton({ icon, onClick }: { icon: React.ReactNode, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/40 text-on-surface-variant transition-all active:scale-90"
    >
      {icon}
    </button>
  );
}
