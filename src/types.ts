export interface User {
  userId: string;
  avatar: string;
  email: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  lastEdited: string;
  isFavorite: boolean;
  isPinned?: boolean;
  imageUrl?: string;
}

export type View = 'notes' | 'favorites' | 'categories' | 'calendar' | 'editor';
