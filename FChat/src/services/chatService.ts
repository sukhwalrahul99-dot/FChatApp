
import {
  collection,
  doc,
  setDoc,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  where,
  getDocs,
  getDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  increment,
} from '@react-native-firebase/firestore';

import {getIdToken} from '@react-native-firebase/auth';

import {auth, db} from './firebase';
import {UserProfile, ChatMessage} from '../types';

// Cloudinary Configuration
const CLOUDINARY_CLOUD_NAME = 'eqhym3o6';
const CLOUDINARY_UPLOAD_PRESET = 'chat_media';

// Notification Backend URL
const NOTIFICATION_API_URL =
  'https://kebab-chewy-garden.ngrok-free.dev';

export type NotificationType = 'single' | 'group';

// ---------------------------------------------
// PUSH NOTIFICATION
// ---------------------------------------------

const sendPushNotification = async (
  conversationId: string,
  messageId: string,
  notificationType: NotificationType,
) => {
  try {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      console.log('Notification Error: User not logged in');
      return;
    }

    const idToken = await getIdToken(currentUser);

    const response = await fetch(
      `${NOTIFICATION_API_URL}/send-notification`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          conversationId,
          messageId,
          notificationType,
        }),
      },
    );

    const result = await response.json();

    if (!response.ok) {
      console.log('Notification API Error:', result);
      return;
    }

    console.log('Notification Sent:', result);
  } catch (error) {
    console.log('Push Notification Error:', error);
  }
};

// ---------------------------------------------
// GET USERS
// ---------------------------------------------

export const getUsers = async (currentUserId: string) => {
  const usersQuery = query(
    collection(db, 'users'),
    where('uid', '!=', currentUserId),
  );

  const snapshot = await getDocs(usersQuery);

  return snapshot.docs.map(item => ({
    uid: item.id,
    ...(item.data() as Omit<UserProfile, 'uid'>),
  }));
};

// ---------------------------------------------
// SINGLE CONVERSATION ID
// ---------------------------------------------

export const getConversationId = (
  currentUserId: string,
  otherUserId: string,
) => {
  return [currentUserId, otherUserId].sort().join('_');
};

// ---------------------------------------------
// CREATE SINGLE CONVERSATION
// ---------------------------------------------

export const createConversation = async (
  currentUserId: string,
  otherUserId: string,
) => {
  if (!currentUserId || !otherUserId) {
    throw new Error('User ID is missing.');
  }

  if (currentUserId === otherUserId) {
    throw new Error('Cannot create conversation with yourself.');
  }

  const conversationId = getConversationId(
    currentUserId,
    otherUserId,
  );

  const conversationRef = doc(
    db,
    'conversations',
    conversationId,
  );

  const conversationSnapshot = await getDoc(conversationRef);

  if (!conversationSnapshot.exists()) {
    await setDoc(conversationRef, {
      type: 'single',
      members: [currentUserId, otherUserId].sort(),
      updatedAt: serverTimestamp(),
      unreadCounts: {
        [currentUserId]: 0,
        [otherUserId]: 0,
      },
    });
  } else {
    const data = conversationSnapshot.data();

    if (
      !Array.isArray(data.members) ||
      !data.members.includes(currentUserId) ||
      !data.members.includes(otherUserId)
    ) {
      throw new Error('Conversation members do not match.');
    }
  }

  return conversationId;
};

// ---------------------------------------------
// CREATE GROUP CONVERSATION
// ---------------------------------------------

export const createGroupConversation = async (
  groupName: string,
  memberIds: string[],
  createdBy: string,
) => {
  if (!groupName.trim()) {
    throw new Error('Group name is required.');
  }

  if (!createdBy) {
    throw new Error('Creator ID is required.');
  }

  // Include creator and remove duplicate IDs
  const members = [
    ...new Set([...memberIds, createdBy]),
  ];

  if (members.length < 3) {
    throw new Error('Select at least 2 other members.');
  }

  const groupRef = doc(collection(db, 'conversations'));

  const unreadCounts: Record<string, number> = {};

  members.forEach(uid => {
    unreadCounts[uid] = 0;
  });

  await setDoc(groupRef, {
    type: 'group',
    groupName: groupName.trim(),
    members,
    createdBy,
    lastMessage: 'Group created',
    lastMessageType: 'text',
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    unreadCounts,
  });

  return groupRef.id;
};

// ---------------------------------------------
// LISTEN TO GROUP CONVERSATIONS
// ---------------------------------------------

export const listenToGroupConversations = (
  currentUserId: string,
  callback: (groups: any[]) => void,
  onError?: (error: Error) => void,
) => {
  const groupsQuery = query(
    collection(db, 'conversations'),
    where('members', 'array-contains', currentUserId),
    where('type', '==', 'group'),
  );

  return onSnapshot(
    groupsQuery,
    snapshot => {
      const groups = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data(),
      }));

      groups.sort((a: any, b: any) => {
        const dateA =
          a.lastMessageAt?.toDate?.()?.getTime() || 0;

        const dateB =
          b.lastMessageAt?.toDate?.()?.getTime() || 0;

        return dateB - dateA;
      });

      callback(groups);
    },
    error => {
      console.log('Group Listener Error:', error);
      onError?.(error);
    },
  );
};

// ---------------------------------------------
// UPDATE CONVERSATION AFTER MESSAGE
// ---------------------------------------------

const updateConversationAfterMessage = async (
  conversationId: string,
  senderId: string,
  lastMessage: string,
  messageType: string,
) => {
  const conversationRef = doc(
    db,
    'conversations',
    conversationId,
  );

  const conversationSnapshot = await getDoc(conversationRef);

  if (!conversationSnapshot.exists()) {
    throw new Error('Conversation not found.');
  }

  const conversationData = conversationSnapshot.data();

  const members: string[] = conversationData.members || [];

  if (!members.includes(senderId)) {
    throw new Error('You are not a conversation member.');
  }

  const notificationType: NotificationType =
    conversationData.type === 'group' || members.length > 2
      ? 'group'
      : 'single';

  const updateData: Record<string, any> = {
    lastMessage,
    lastMessageType: messageType,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // Increment unread count for every recipient except sender
  members.forEach(uid => {
    if (uid !== senderId) {
      updateData[`unreadCounts.${uid}`] = increment(1);
    }
  });

  await updateDoc(conversationRef, updateData);

  return notificationType;
};

// ---------------------------------------------
// SEND TEXT MESSAGE
// ---------------------------------------------

export const sendMessage = async (
  conversationId: string,
  text: string,
  senderId: string,
) => {
  if (!text.trim()) {
    return;
  }

  const conversationRef = doc(
    db,
    'conversations',
    conversationId,
  );

  const conversationSnapshot = await getDoc(conversationRef);

  if (!conversationSnapshot.exists()) {
    throw new Error('Conversation not found.');
  }

  const conversationData = conversationSnapshot.data();

  if (!(conversationData.members || []).includes(senderId)) {
    throw new Error('You are not a conversation member.');
  }

  const messageRef = await addDoc(
    collection(
      db,
      'conversations',
      conversationId,
      'messages',
    ),
    {
      text: text.trim(),
      senderId,
      messageType: 'text',
      seenBy: [senderId],
      createdAt: serverTimestamp(),
      notificationSent: false,
    },
  );

  const notificationType = await updateConversationAfterMessage(
    conversationId,
    senderId,
    text.trim(),
    'text',
  );

  await sendPushNotification(
    conversationId,
    messageRef.id,
    notificationType,
  );

  return messageRef.id;
};

// ---------------------------------------------
// CLOUDINARY RESOURCE TYPE
// ---------------------------------------------

const getResourceType = (fileType: string) => {
  if (fileType.startsWith('image/')) {
    return 'image';
  }

  if (fileType.startsWith('video/')) {
    return 'video';
  }

  return 'raw';
};

// ---------------------------------------------
// UPLOAD MEDIA
// ---------------------------------------------

export const uploadMedia = async (
  conversationId: string,
  senderId: string,
  fileUri: string,
  fileName: string,
  fileType: string,
  fileSize?: number,
) => {
  try {
    if (!conversationId || !senderId || !fileUri) {
      throw new Error('Missing required upload information.');
    }

    const safeFileName = (
      fileName || `file_${Date.now()}`
    ).replace(/[^a-zA-Z0-9._-]/g, '_');

    const mimeType = fileType || 'application/octet-stream';

    const resourceType = getResourceType(mimeType);

    const formData = new FormData();

    formData.append(
      'file',
      {
        uri: fileUri,
        type: mimeType,
        name: safeFileName,
      } as any,
    );

    formData.append(
      'upload_preset',
      CLOUDINARY_UPLOAD_PRESET,
    );

    formData.append('folder', 'chat_media');

    const uploadUrl =
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result?.error?.message || 'Cloudinary upload failed.',
      );
    }

    if (!result?.secure_url) {
      throw new Error('Cloudinary media URL not received.');
    }

    let messageType: 'image' | 'video' | 'document';

    if (resourceType === 'image') {
      messageType = 'image';
    } else if (resourceType === 'video') {
      messageType = 'video';
    } else {
      messageType = 'document';
    }

    const messageRef = await addDoc(
      collection(
        db,
        'conversations',
        conversationId,
        'messages',
      ),
      {
        text: '',
        senderId,
        messageType,
        seenBy: [senderId],
        mediaUrl: result.secure_url,
        fileName: safeFileName,
        fileType: mimeType,
        fileSize: fileSize || 0,
        cloudinaryPublicId: result.public_id,
        resourceType,
        createdAt: serverTimestamp(),
        notificationSent: false,
      },
    );

    const previewText =
      messageType === 'image'
        ? 'Photo'
        : messageType === 'video'
        ? 'Video'
        : 'Document';

    const notificationType = await updateConversationAfterMessage(
      conversationId,
      senderId,
      previewText,
      messageType,
    );

    await sendPushNotification(
      conversationId,
      messageRef.id,
      notificationType,
    );

    return {
      messageId: messageRef.id,
      mediaUrl: result.secure_url,
      publicId: result.public_id,
      messageType,
    };
  } catch (error: any) {
    console.error('Cloudinary Upload Error:', error);

    throw new Error(
      error?.message || 'Unable to upload media.',
    );
  }
};

// ---------------------------------------------
// DELETE OWN MESSAGE
// ---------------------------------------------

export const deleteMessage = async (
  conversationId: string,
  messageId: string,
  currentUserId: string,
) => {
  const messageRef = doc(
    db,
    'conversations',
    conversationId,
    'messages',
    messageId,
  );

  const snapshot = await getDoc(messageRef);

  if (!snapshot.exists()) {
    throw new Error('Message not found.');
  }

  const messageData = snapshot.data();

  if (messageData.senderId !== currentUserId) {
    throw new Error('You can only delete your own messages.');
  }

  await deleteDoc(messageRef);
};

// ---------------------------------------------
// MARK MESSAGES AS SEEN
// ---------------------------------------------

export const markMessagesAsSeen = async (
  conversationId: string,
  currentUserId: string,
  messages: ChatMessage[],
) => {
  const incomingMessages = messages.filter(
    message =>
      message.senderId !== currentUserId &&
      !(message.seenBy || []).includes(currentUserId),
  );

  const updates = incomingMessages.map(message =>
    updateDoc(
      doc(
        db,
        'conversations',
        conversationId,
        'messages',
        message.id,
      ),
      {
        seenBy: arrayUnion(currentUserId),
      },
    ),
  );

  if (updates.length > 0) {
    await Promise.all(updates);
  }

  // Reset current user's unread count
  await updateDoc(
    doc(db, 'conversations', conversationId),
    {
      [`unreadCounts.${currentUserId}`]: 0,
    },
  );
};

// ---------------------------------------------
// LISTEN TO MESSAGES
// ---------------------------------------------

export const listenToMessages = (
  conversationId: string,
  callback: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void,
) => {
  const messagesQuery = query(
    collection(
      db,
      'conversations',
      conversationId,
      'messages',
    ),
    orderBy('createdAt', 'asc'),
  );

  return onSnapshot(
    messagesQuery,
    snapshot => {
      const messages: ChatMessage[] = snapshot.docs.map(
        item => ({
          id: item.id,
          ...(item.data() as Omit<ChatMessage, 'id'>),
        }),
      );

      callback(messages);
    },
    error => {
      console.error('Messages Listener Error:', error);
      onError?.(error);
    },
  );
};