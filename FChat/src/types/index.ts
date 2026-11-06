
export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  createdAt?: any;
}

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt?: any;
}

export interface Conversation {
  id: string;
  members: string[];
  updatedAt?: any;
}




export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt?: any;

  messageType?: 'text' | 'image' | 'video' | 'document';
  mediaUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  cloudinaryPublicId?: string;
  resourceType?: string;
  seenBy?: string[];
}

