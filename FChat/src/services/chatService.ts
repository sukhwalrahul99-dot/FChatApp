
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
} from '@react-native-firebase/firestore';

import {getIdToken} from '@react-native-firebase/auth';

import {auth, db} from './firebase';
import {UserProfile, ChatMessage} from '../types';

// Cloudinary Configuration
const CLOUDINARY_CLOUD_NAME = 'eqhym3o6';
const CLOUDINARY_UPLOAD_PRESET = 'chat_media';

// Notification Backend URL
// Android Emulator: 10.0.2.2
// Physical Mobile: Replace with your computer's local IPv4 address
const NOTIFICATION_API_URL = 'http://10.0.2.2:5000';

// Send Push Notification
const sendPushNotification = async (
  conversationId: string,
  messageId: string,
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
        }),
      },
    );

    const result = await response.json();

    if (!response.ok) {
      console.log('Notification API Error:', result);
      return;
    }

    console.log('Notification Sent Successfully:', result);
  } catch (error) {
    console.log('Push Notification Error:', error);
  }
};

// Get all registered users except current user
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

// Generate unique conversation ID
export const getConversationId = (
  currentUserId: string,
  otherUserId: string,
) => {
  return [currentUserId, otherUserId].sort().join('_');
};

// Create or open private conversation
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
      members: [currentUserId, otherUserId].sort(),
      updatedAt: serverTimestamp(),
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

    await updateDoc(conversationRef, {
      updatedAt: serverTimestamp(),
    });
  }

  return conversationId;
};

// Update conversation timestamp
const updateConversationTime = async (
  conversationId: string,
) => {
  const conversationRef = doc(
    db,
    'conversations',
    conversationId,
  );

  await updateDoc(conversationRef, {
    updatedAt: serverTimestamp(),
  });
};

// Send text message
export const sendMessage = async (
  conversationId: string,
  text: string,
  senderId: string,
) => {
  if (!text.trim()) {
    return;
  }

  // Save message in Firestore
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
    },
  );

  await updateConversationTime(conversationId);

  // Send notification to recipient
  await sendPushNotification(
    conversationId,
    messageRef.id,
  );

  return messageRef.id;
};

// Get Cloudinary resource type
const getResourceType = (fileType: string) => {
  if (fileType.startsWith('image/')) {
    return 'image';
  }

  if (fileType.startsWith('video/')) {
    return 'video';
  }

  return 'raw';
};

// Upload media to Cloudinary
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
        result?.error?.message ||
          'Cloudinary upload failed.',
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

    // Save media message in Firestore
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
      },
    );

    await updateConversationTime(conversationId);

    // Send notification to recipient
    await sendPushNotification(
      conversationId,
      messageRef.id,
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

// Delete own message for everyone
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

// Mark incoming messages as seen
export const markMessagesAsSeen = async (
  conversationId: string,
  currentUserId: string,
  messages: ChatMessage[],
) => {
  const updates = messages
    .filter(
      message =>
        message.senderId !== currentUserId &&
        !(message.seenBy || []).includes(currentUserId),
    )
    .map(message =>
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

  await Promise.all(updates);
};

// Listen to real-time messages
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
