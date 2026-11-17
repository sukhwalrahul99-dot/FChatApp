
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

import {SafeAreaView} from 'react-native-safe-area-context';

import {
  getDoc,
  doc,
} from '@react-native-firebase/firestore';

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

import {ChatMessage} from '../types';

import MessageBubble from '../components/MessageBubble';

import {db} from '../services/firebase';

import {
  listenToMessages,
  sendMessage,
  uploadMedia,
  deleteMessage,
  markMessagesAsSeen,
} from '../services/chatService';

interface GroupChatScreenProps {
  currentUserId: string;
  groupId: string;
  groupName: string;
  memberCount?: number;
  onBack: () => void;
}

const GroupChatScreen: React.FC<GroupChatScreenProps> = ({
  currentUserId,
  groupId,
  groupName,
  memberCount,
  onBack,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Store group member names
  const [senderNames, setSenderNames] = useState<
    Record<string, string>
  >({});

  // Listen to group messages
  useEffect(() => {
    if (!groupId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribe = listenToMessages(
      groupId,
      newMessages => {
        setMessages(newMessages);
        setLoading(false);

        markMessagesAsSeen(
          groupId,
          currentUserId,
          newMessages,
        ).catch(error => {
          console.log('Group Seen Status Error:', error);
        });
      },
      (error: any) => {
        console.log('Group Messages Error:', error);
        setLoading(false);

        Alert.alert(
          'Error',
          error.message || 'Unable to load group messages.',
        );
      },
    );

    return unsubscribe;
  }, [groupId, currentUserId]);

  // Fetch sender names from Firestore users collection
  useEffect(() => {
    const senderIds = Array.from(
      new Set(
        messages
          .map(message => message.senderId)
          .filter(
            senderId =>
              senderId &&
              senderId !== currentUserId &&
              !senderNames[senderId],
          ),
      ),
    );

    if (senderIds.length === 0) {
      return;
    }

    let isActive = true;

    const fetchSenderNames = async () => {
      const results = await Promise.all(
        senderIds.map(async senderId => {
          try {
            const userSnapshot = await getDoc(
              doc(db, 'users', senderId),
            );

            if (userSnapshot.exists()) {
              const userData = userSnapshot.data() as {
                name?: string;
                displayName?: string;
                email?: string;
              };

              const name =
                userData.name?.trim() ||
                userData.displayName?.trim() ||
                userData.email?.split('@')[0] ||
                'Group member';

              return [senderId, name] as const;
            }

            return [senderId, 'Group member'] as const;
          } catch (error) {
            console.log(
              'Sender Name Fetch Error:',
              senderId,
              error,
            );

            return [senderId, 'Group member'] as const;
          }
        }),
      );

      if (isActive) {
        setSenderNames(previous => ({
          ...previous,
          ...Object.fromEntries(results),
        }));
      }
    };

    fetchSenderNames();

    return () => {
      isActive = false;
    };
  }, [messages, currentUserId, senderNames]);

  // Send text message
  const handleSend = async () => {
    const text = messageText.trim();

    if (!text || !groupId || sending || uploading) {
      return;
    }

    try {
      setSending(true);
      setMessageText('');

      await sendMessage(
        groupId,
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

  // Upload media
  const handleMediaUpload = async (asset: Asset) => {
    if (!asset.uri || !groupId) {
      Alert.alert('Error', 'Unable to access selected file.');
      return;
    }

    try {
      setUploading(true);

      const fileName =
        asset.fileName || `media_${Date.now()}`;

      const fileType =
        asset.type || 'application/octet-stream';

      await uploadMedia(
        groupId,
        currentUserId,
        asset.uri,
        fileName,
        fileType,
        asset.fileSize,
      );

      Alert.alert('Success', 'Media sent successfully.');
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
    Alert.alert(
      'Attach Media',
      'Select what you want to send',
      [
        {
          text: 'Photo',
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

  // Delete own message
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
                groupId,
                message.id,
                currentUserId,
              );
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

  // Format message time
  const formatTime = (timestamp: any) => {
    if (!timestamp) {
      return '';
    }

    const date = timestamp?.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

    if (isNaN(date.getTime())) {
      return '';
    }

    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Render message
  const renderMessage = ({item}: {item: ChatMessage}) => {
    const isMine = item.senderId === currentUserId;

    const senderName = isMine
      ? 'You'
      : senderNames[item.senderId] || 'Group member';

    return (
      <View>
        {!isMine && (
          <Text style={styles.senderName}>
            {senderName}
          </Text>
        )}

        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={() => handleDeleteMessage(item)}
          delayLongPress={500}>
          <MessageBubble
            message={item}
            currentUserId={currentUserId}
          />
        </TouchableOpacity>

        <View
          style={[
            styles.messageFooter,
            isMine
              ? styles.myMessageFooter
              : styles.otherMessageFooter,
          ]}>
          <Text style={styles.timeText}>
            {formatTime(item.createdAt)}
          </Text>

          {isMine && (
            <Text style={styles.seenText}>
              {(item.seenBy || []).length > 1
                ? `Seen by ${(item.seenBy || []).length - 1}`
                : 'Sent'}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'bottom']}>

      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
        translucent={false}
      />

      <KeyboardAvoidingView
  style={styles.container}
  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>

          <View style={styles.groupAvatar}>
            <Text style={styles.groupAvatarText}>
              {groupName.trim().charAt(0).toUpperCase() || 'G'}
            </Text>
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {groupName}
            </Text>

            <Text style={styles.headerSubtitle}>
              {memberCount
                ? `${memberCount} members`
                : 'Group conversation'}
            </Text>
          </View>
        </View>

        {/* Messages */}
        <View style={styles.chatArea}>
          {loading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator
                size="large"
                color="#2563EB"
              />

              <Text style={styles.loadingText}>
                Loading messages...
              </Text>
            </View>
          ) : (
            <FlatList
              data={[...messages].reverse()}
              keyExtractor={item => item.id}
              renderItem={renderMessage}
              inverted
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.messageList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyTitle}>
                    No Messages Yet
                  </Text>

                  <Text style={styles.emptySubtitle}>
                    Send the first message to this group.
                  </Text>
                </View>
              }
            />
          )}
        </View>

        {/* Upload indicator */}
        {uploading && (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator color="#2563EB" />

            <Text style={styles.uploadingText}>
              Uploading media...
            </Text>
          </View>
        )}

        {/* Input */}
        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={styles.attachButton}
            onPress={showAttachmentOptions}
            disabled={uploading || sending}>
            <Text style={styles.attachText}>+</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.messageInput}
            placeholder="Type a message..."
            placeholderTextColor="#94A3B8"
            value={messageText}
            onChangeText={setMessageText}
            multiline
            maxLength={4000}
            editable={!uploading && !sending}
          />

          <TouchableOpacity
            style={[
              styles.sendButton,
              (!messageText.trim() || sending || uploading) &&
                styles.disabledButton,
            ]}
            onPress={handleSend}
            disabled={
              !messageText.trim() || sending || uploading
            }>
            {sending ? (
              <ActivityIndicator
                color="#FFFFFF"
                size="small"
              />
            ) : (
              <Text style={styles.sendText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default GroupChatScreen;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    elevation: 2,
  },

  backButton: {
    width: 38,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },

  backText: {
    fontSize: 34,
    color: '#2563EB',
    lineHeight: 38,
  },

  groupAvatar: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 11,
  },

  groupAvatarText: {
    fontSize: 19,
    fontWeight: '800',
    color: '#15803D',
  },

  headerInfo: {
    flex: 1,
  },

  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#172554',
  },

  headerSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },

  chatArea: {
    flex: 1,
  },

  messageList: {
    paddingHorizontal: 8,
    paddingVertical: 15,
    flexGrow: 1,
  },

  senderName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
    marginLeft: 14,
    marginTop: 8,
  },

  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 15,
    marginBottom: 5,
    marginTop: -2,
  },

  myMessageFooter: {
    justifyContent: 'flex-end',
  },

  otherMessageFooter: {
    justifyContent: 'flex-start',
  },

  timeText: {
    fontSize: 9,
    color: '#94A3B8',
  },

  seenText: {
    fontSize: 9,
    color: '#2563EB',
    marginLeft: 7,
    fontWeight: '600',
  },

  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 10,
  },

  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#172554',
  },

  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 7,
  },

  uploadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    backgroundColor: '#EFF6FF',
  },

  uploadingText: {
    fontSize: 11,
    color: '#2563EB',
    marginLeft: 9,
    fontWeight: '600',
  },

  inputContainer: {
  flexDirection: 'row',
  alignItems: 'flex-end',
  backgroundColor: '#FFFFFF',
  paddingHorizontal: 10,
  paddingTop: 8,
  paddingBottom: Platform.OS === 'ios' ? 8 : 6,
  borderTopWidth: 1,
  borderTopColor: '#E2E8F0',
},
  attachButton: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  attachText: {
    fontSize: 28,
    lineHeight: 31,
    color: '#2563EB',
  },

  messageInput: {
  flex: 1,
  minHeight: 43,
  maxHeight: 110,
  backgroundColor: '#F1F5F9',
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: 8,
  fontSize: 13,
  color: '#172554',
  textAlignVertical: 'center',
  includeFontPadding: false,
},

  sendButton: {
    height: 43,
    minWidth: 58,
    borderRadius: 13,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    paddingHorizontal: 10,
  },

  disabledButton: {
    opacity: 0.5,
  },

  sendText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
