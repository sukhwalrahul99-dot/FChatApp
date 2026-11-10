
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

import {ChatMessage} from '../types';

import MessageBubble from '../components/MessageBubble';

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
      error => {
        console.log('Group Messages Error:', error);
        setLoading(false);
        Alert.alert('Error', error.message);
      },
    );

    return unsubscribe;
  }, [groupId, currentUserId]);

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

    const senderName = isMine ? 'You' : 'Member';

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}>

      <StatusBar barStyle="dark-content" />

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
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          inverted={false}
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
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.sendText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

export default GroupChatScreen;

const styles = StyleSheet.create({
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
    paddingVertical: 10,
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
    paddingTop: 11,
    paddingBottom: 10,
    fontSize: 13,
    color: '#172554',
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
