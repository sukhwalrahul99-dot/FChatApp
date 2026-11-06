
import React, {useEffect, useState} from 'react';

import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StatusBar,
} from 'react-native';

import {
  launchImageLibrary,
  ImageLibraryOptions,
  Asset,
} from 'react-native-image-picker';

import {
  pick,
  types,
  errorCodes,
  isErrorWithCode,
} from '@react-native-documents/picker';

import {UserProfile, ChatMessage} from '../types';

import MessageBubble from '../components/MessageBubble';

import {
  createConversation,
  listenToMessages,
  sendMessage,
  uploadMedia,
  deleteMessage,
  markMessagesAsSeen,
} from '../services/chatService';

interface ChatScreenProps {
  currentUserId: string;
  selectedUser: UserProfile;
  onBack: () => void;
}

const ChatScreen: React.FC<ChatScreenProps> = ({
  currentUserId,
  selectedUser,
  onBack,
}) => {
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Create or open conversation
  useEffect(() => {
    let isActive = true;

    const setupChat = async () => {
      try {
        setLoading(true);

        const id = await createConversation(
          currentUserId,
          selectedUser.uid,
        );

        if (isActive) {
          setConversationId(id);
        }
      } catch (error: any) {
        Alert.alert(
          'Unable to Open Chat',
          error.message || 'Something went wrong.',
        );

        setLoading(false);
      }
    };

    setupChat();

    return () => {
      isActive = false;
    };
  }, [currentUserId, selectedUser.uid]);

  // Real-time messages + automatic seen status
  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const unsubscribe = listenToMessages(
      conversationId,
      newMessages => {
        setMessages(newMessages);
        setLoading(false);

        // Mark incoming messages as seen
        markMessagesAsSeen(
          conversationId,
          currentUserId,
          newMessages,
        ).catch(error => {
          console.log('Seen Status Error:', error);
        });
      },
    );

    return unsubscribe;
  }, [conversationId, currentUserId]);

  // Send text message
  const handleSend = async () => {
    const text = messageText.trim();

    if (
      !text ||
      !conversationId ||
      sending ||
      uploading
    ) {
      return;
    }

    try {
      setSending(true);
      setMessageText('');

      await sendMessage(
        conversationId,
        text,
        currentUserId,
      );
    } catch (error: any) {
      setMessageText(text);

      Alert.alert(
        'Message Failed',
        error.message || 'Unable to send message.',
      );
    } finally {
      setSending(false);
    }
  };

  // Delete message for everyone
  const handleDeleteMessage = (message: ChatMessage) => {
    if (message.senderId !== currentUserId) {
      return;
    }

    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message for everyone?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete for Everyone',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMessage(
                conversationId,
                message.id,
                currentUserId,
              );

              // Firestore listener automatically removes message
            } catch (error: any) {
              Alert.alert(
                'Delete Failed',
                error.message || 'Unable to delete message.',
              );
            }
          },
        },
      ],
    );
  };

  // Upload selected media to Cloudinary
  const handleMediaUpload = async (asset: Asset) => {
    if (!asset.uri || !conversationId) {
      Alert.alert(
        'Error',
        'Unable to access selected file.',
      );
      return;
    }

    try {
      setUploading(true);

      const fileName =
        asset.fileName || `media_${Date.now()}`;

      const fileType =
        asset.type || 'application/octet-stream';

      await uploadMedia(
        conversationId,
        currentUserId,
        asset.uri,
        fileName,
        fileType,
        asset.fileSize,
      );

      Alert.alert(
        'Success',
        'Media sent successfully.',
      );
    } catch (error: any) {
      Alert.alert(
        'Upload Failed',
        error.message || 'Unable to upload media.',
      );
    } finally {
      setUploading(false);
    }
  };

  // Open image or video gallery
  const openGallery = async (
    mediaType: 'photo' | 'video',
  ) => {
    try {
      const options: ImageLibraryOptions = {
        mediaType,
        selectionLimit: 1,
      };

      const result = await launchImageLibrary(options);

      if (result.didCancel) {
        return;
      }

      if (result.errorCode) {
        Alert.alert(
          'Picker Error',
          result.errorMessage || 'Unable to open gallery.',
        );
        return;
      }

      const asset = result.assets?.[0];

      if (asset) {
        await handleMediaUpload(asset);
      }
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.message || 'Something went wrong.',
      );
    }
  };

  // Open document picker
  const openDocument = async () => {
    try {
      const result = await pick({
        type: [
          types.pdf,
          types.doc,
          types.docx,
        ],
        allowMultiSelection: false,
      });

      const file = result[0];

      if (!file?.uri) {
        return;
      }

      const documentAsset: Asset = {
        uri: file.uri,
        fileName: file.name || `document_${Date.now()}`,
        type: file.type || 'application/octet-stream',
        fileSize: file.size || 0,
      };

      await handleMediaUpload(documentAsset);
    } catch (error: any) {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      ) {
        return;
      }

      Alert.alert(
        'Document Error',
        error.message || 'Unable to select document.',
      );
    }
  };

  // Attachment options
  const showAttachmentOptions = () => {
    if (
      loading ||
      uploading ||
      sending ||
      !conversationId
    ) {
      return;
    }

    Alert.alert(
      'Attach File',
      'Select attachment type',
      [
        {
          text: 'Image',
          onPress: () => openGallery('photo'),
        },
        {
          text: 'Video',
          onPress: () => openGallery('video'),
        },
        {
          text: 'Document',
          onPress: openDocument,
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
    );
  };

  // User initial
  const userInitial = selectedUser.name
    ? selectedUser.name.charAt(0).toUpperCase()
    : '?';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}>

      <StatusBar barStyle="dark-content" />

      {/* Premium Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.7}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {userInitial}
          </Text>
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {selectedUser.name}
          </Text>

          <Text style={styles.userStatus}>
            {selectedUser.email}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.headerAction}
          activeOpacity={0.7}>
          <Text style={styles.actionIcon}>⋮</Text>
        </TouchableOpacity>
      </View>

      {/* Chat Area */}
      <View style={styles.chatArea}>
        {loading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator
              size="large"
              color="#2563EB"
            />

            <Text style={styles.loadingText}>
              Loading conversation...
            </Text>
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={item => item.id}
            renderItem={({item}) => {
              const isMine =
                item.senderId === currentUserId;

              const isSeen =
                (item.seenBy || []).includes(selectedUser.uid);

              return (
                <View style={styles.messageItem}>
                  <TouchableOpacity
                    activeOpacity={1}
                    onLongPress={() => {
                      if (isMine) {
                        handleDeleteMessage(item);
                      }
                    }}
                    delayLongPress={500}>
                    <MessageBubble
                      message={item}
                      currentUserId={currentUserId}
                    />
                  </TouchableOpacity>

                  {/* Sent / Seen status */}
                  {isMine && (
                    <View style={styles.receiptContainer}>
                      <Text
                        style={[
                          styles.receiptText,
                          isSeen && styles.seenText,
                        ]}>
                        {isSeen ? 'Seen' : 'Sent'}
                      </Text>
                    </View>
                  )}
                </View>
              );
            }}
            style={styles.messageList}
            contentContainerStyle={[
              styles.messageContent,
              messages.length === 0 &&
                styles.emptyContent,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIcon}>
                  <Text style={styles.emptyEmoji}>✉</Text>
                </View>

                <Text style={styles.emptyTitle}>
                  Start a Conversation
                </Text>

                <Text style={styles.emptySubtitle}>
                  Send your first message to{' '}
                  {selectedUser.name}.
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* Upload Progress */}
      {uploading && (
        <View style={styles.uploadingContainer}>
          <ActivityIndicator color="#2563EB" />

          <Text style={styles.uploadingText}>
            Uploading media...
          </Text>
        </View>
      )}

      {/* Message Input */}
      <View style={styles.inputWrapper}>
        <View style={styles.inputContainer}>

          <TouchableOpacity
            style={styles.attachButton}
            onPress={showAttachmentOptions}
            disabled={loading || uploading || sending}>
            <Text style={styles.attachIcon}>＋</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Type your message..."
            placeholderTextColor="#94A3B8"
            value={messageText}
            onChangeText={setMessageText}
            multiline
            maxLength={3000}
            editable={!sending && !loading && !uploading}
          />

          <TouchableOpacity
            style={[
              styles.sendButton,
              (!messageText.trim() ||
                sending ||
                loading ||
                uploading) &&
                styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={
              sending ||
              uploading ||
              loading ||
              !messageText.trim() ||
              !conversationId
            }
            activeOpacity={0.8}>

            <Text style={styles.sendIcon}>
              {sending ? '...' : '➤'}
            </Text>
          </TouchableOpacity>

        </View>

        <Text style={styles.footerText}>
          Private conversation
        </Text>
      </View>

    </KeyboardAvoidingView>
  );
};

export default ChatScreen;

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },

  header: {
    marginTop: 10,
    minHeight: 80,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    elevation: 3,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 3,
    },
  },

  backButton: {
    width: 38,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 5,
  },

  backIcon: {
    fontSize: 36,
    color: '#334155',
    lineHeight: 40,
  },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  avatarText: {
    color: '#1D4ED8',
    fontSize: 19,
    fontWeight: 'bold',
  },

  headerInfo: {
    flex: 1,
    justifyContent: 'center',
  },

  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },

  userStatus: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },

  headerAction: {
    width: 38,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },

  actionIcon: {
    fontSize: 26,
    color: '#475569',
    fontWeight: 'bold',
  },

  chatArea: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },

  messageList: {
    flex: 1,
  },

  messageContent: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 20,
  },

  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748B',
  },

  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 25,
  },

  emptyIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },

  emptyEmoji: {
    fontSize: 30,
    color: '#2563EB',
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },

  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  messageItem: {
    width: '100%',
  },

  receiptContainer: {
    alignItems: 'flex-end',
    paddingHorizontal: 25,
    marginTop: -3,
    marginBottom: 5,
  },

  receiptText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
  },

  seenText: {
    color: '#2563EB',
    fontWeight: '700',
  },

  uploadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 10,
    gap: 10,
  },

  uploadingText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '600',
  },

  inputWrapper: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 18 : 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F1F5F9',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  attachButton: {
    width: 38,
    height: 43,
    alignItems: 'center',
    justifyContent: 'center',
  },

  attachIcon: {
    fontSize: 30,
    color: '#2563EB',
    fontWeight: '400',
  },

  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    textAlignVertical: 'center',
  },

  sendButton: {
    width: 43,
    height: 43,
    borderRadius: 15,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 7,
  },

  sendButtonDisabled: {
    backgroundColor: '#94A3B8',
  },

  sendIcon: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: 'bold',
  },

  footerText: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 10,
    marginTop: 8,
  },
});
