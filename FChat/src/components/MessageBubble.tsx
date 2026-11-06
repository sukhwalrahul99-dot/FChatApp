
import React, {useState} from 'react';

import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';

import Video from 'react-native-video';
import ReactNativeBlobUtil from 'react-native-blob-util';
import FileViewer from 'react-native-file-viewer';

import {ChatMessage} from '../types';

interface MessageBubbleProps {
  message: ChatMessage;
  currentUserId: string;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  currentUserId,
}) => {
  const isMine = message.senderId === currentUserId;

  const [imageVisible, setImageVisible] = useState(false);
  const [videoVisible, setVideoVisible] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(false);

  // Get MIME type
  const getMimeType = (fileName: string, fileType?: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();

    const mimeTypes: {[key: string]: string} = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain',
      csv: 'text/csv',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
    };

    return mimeTypes[extension || ''] || fileType || 'application/octet-stream';
  };

  // Download document and open it
  const openDocument = async () => {
    if (!message.mediaUrl) {
      Alert.alert('Error', 'Document URL not found.');
      return;
    }

    if (documentLoading) {
      return;
    }

    if (Platform.OS !== 'android') {
      Alert.alert('Error', 'This download feature is configured for Android.');
      return;
    }

    let temporaryPath = '';

    try {
      setDocumentLoading(true);

      const originalName =
        message.fileName || `document_${Date.now()}.pdf`;

      const safeName = originalName.replace(
        /[^a-zA-Z0-9._-]/g,
        '_',
      );

      const extension = safeName.split('.').pop()?.toLowerCase() || '';
      const mimeType = getMimeType(safeName, message.fileType);

      // Unique filename to avoid overwriting an existing file
      const uniqueName = `${Date.now()}_${safeName}`;

      // Step 1: Download to app cache
      temporaryPath =
        `${ReactNativeBlobUtil.fs.dirs.CacheDir}/${uniqueName}`;

      console.log('DOCUMENT URL:', message.mediaUrl);
      console.log('TEMP PATH:', temporaryPath);

      const response = await ReactNativeBlobUtil
        .config({
          path: temporaryPath,
          fileCache: true,
        })
        .fetch('GET', message.mediaUrl, {
          Accept: '*/*',
        });

      const status = response.info().status;
      const downloadedPath = response.path();

      console.log('DOWNLOAD STATUS:', status);
      console.log('DOWNLOAD RESPONSE:', response.info());

      if (status < 200 || status >= 300) {
        let serverMessage = '';

        try {
          serverMessage = await response.text();
        } catch (e) {
          console.log('Could not read error response:', e);
        }

        console.log('SERVER ERROR:', serverMessage);

        throw new Error(
          `Download failed (HTTP ${status}). ${
            status === 401 || status === 403
              ? 'Cloudinary is blocking access to this file.'
              : serverMessage || 'Please try again.'
          }`,
        );
      }

      // Step 2: Check downloaded file
      const fileExists =
        await ReactNativeBlobUtil.fs.exists(downloadedPath);

      if (!fileExists) {
        throw new Error('Downloaded file not found in cache.');
      }

      const fileStat =
        await ReactNativeBlobUtil.fs.stat(downloadedPath);

      console.log('DOWNLOADED FILE SIZE:', fileStat.size);

      if (Number(fileStat.size) === 0) {
        throw new Error('Downloaded file is empty.');
      }

      // Step 3: Save in public Downloads using Android Download Manager
      const downloadResponse = await ReactNativeBlobUtil
        .config({
          addAndroidDownloads: {
            useDownloadManager: true,
            notification: true,
            title: safeName,
            description: 'Saving document to Downloads...',
            mime: mimeType,
            mediaScannable: true,
            path: `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/${uniqueName}`,
          },
        })
        .fetch('GET', message.mediaUrl);

      const saveStatus = downloadResponse.info().status;

      console.log('DOWNLOAD MANAGER STATUS:', saveStatus);
      console.log('DOWNLOAD MANAGER PATH:', downloadResponse.path());

      if (saveStatus < 200 || saveStatus >= 300) {
        throw new Error(
          `Could not save file to Downloads. HTTP ${saveStatus}`,
        );
      }

      // Step 4: Open the downloaded file from cache
      // Cache file is available to FileViewer without public-storage permission.
      Alert.alert(
        'Download Complete',
        `${safeName} has been downloaded. Opening document...`,
        [
          {
            text: 'OK',
            onPress: async () => {
              try {
                await FileViewer.open(downloadedPath, {
  showOpenWithDialog: true,
  displayName: safeName,
});
              } catch (openError: any) {
                console.log('FILE OPEN ERROR:', openError);

                Alert.alert(
                  'Unable to Open',
                  'File is downloaded, but no supported app was found to open it.',
                );
              }
            },
          },
        ],
      );
    } catch (error: any) {
      console.log('DOCUMENT DOWNLOAD ERROR:', error);

      const errorMessage =
        error?.message || 'Unable to download document.';

      Alert.alert('Download Failed', errorMessage);
    } finally {
      setDocumentLoading(false);
    }
  };

  // Format file size
  const formatFileSize = (size?: number) => {
    if (!size) {
      return '';
    }

    return size < 1024 * 1024
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderMedia = () => {
    if (!message.mediaUrl) {
      return null;
    }

    switch (message.messageType) {
      // IMAGE
      case 'image':
        return (
          <>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setImageVisible(true)}>
              <Image
                source={{uri: message.mediaUrl}}
                style={styles.image}
                resizeMode="cover"
                onError={e =>
                  console.log('IMAGE LOAD ERROR:', e.nativeEvent)
                }
              />
            </TouchableOpacity>

            <Modal
              visible={imageVisible}
              transparent
              animationType="fade"
              onRequestClose={() => setImageVisible(false)}>
              <View style={styles.modalContainer}>
                <Pressable
                  style={styles.closeButton}
                  onPress={() => setImageVisible(false)}>
                  <Text style={styles.closeText}>✕</Text>
                </Pressable>

                <Image
                  source={{uri: message.mediaUrl}}
                  style={styles.fullImage}
                  resizeMode="contain"
                />
              </View>
            </Modal>
          </>
        );

      // VIDEO
      case 'video':
        return (
          <>
            <TouchableOpacity
              style={styles.videoContainer}
              activeOpacity={0.85}
              onPress={() => {
                setVideoLoading(true);
                setVideoVisible(true);
              }}>
              <View style={styles.videoPlaceholder}>
                <Text style={styles.videoIcon}>▶</Text>

                <Text style={styles.videoText}>Play Video</Text>

                <Text style={styles.videoFileName}>
                  {message.fileName || 'Video'}
                </Text>
              </View>
            </TouchableOpacity>

            <Modal
              visible={videoVisible}
              animationType="fade"
              onRequestClose={() => setVideoVisible(false)}>
              <View style={styles.videoModal}>
                <Pressable
                  style={styles.closeButton}
                  onPress={() => setVideoVisible(false)}>
                  <Text style={styles.closeText}>✕</Text>
                </Pressable>

                <Video
                  source={{uri: message.mediaUrl}}
                  style={styles.videoPlayer}
                  controls
                  resizeMode="contain"
                  onLoad={() => setVideoLoading(false)}
                  onBuffer={({isBuffering}: {
                    isBuffering: boolean;
                  }) => setVideoLoading(isBuffering)}
                  onError={(error: any) => {
                    setVideoLoading(false);

                    console.log('VIDEO ERROR:', error);

                    Alert.alert(
                      'Video Error',
                      'Unable to play this video.',
                    );
                  }}
                />

                {videoLoading && (
                  <ActivityIndicator
                    size="large"
                    color="#FFFFFF"
                    style={styles.videoLoader}
                  />
                )}
              </View>
            </Modal>
          </>
        );

      // DOCUMENT
      case 'document':
        return (
          <TouchableOpacity
            style={styles.documentContainer}
            activeOpacity={0.8}
            disabled={documentLoading}
            onPress={openDocument}>
            <View style={styles.documentIconContainer}>
              <Text style={styles.documentIcon}>FILE</Text>
            </View>

            <View style={styles.documentInfo}>
              <Text
                style={[
                  styles.documentName,
                  isMine && styles.myText,
                ]}
                numberOfLines={2}>
                {message.fileName || 'Document'}
              </Text>

              <Text
                style={[
                  styles.documentSize,
                  isMine && styles.mySubText,
                ]}>
                {formatFileSize(message.fileSize)}
              </Text>

              <Text
                style={[
                  styles.documentOpenText,
                  isMine && styles.mySubText,
                ]}>
                {documentLoading
                  ? 'Downloading...'
                  : 'Tap to download and open'}
              </Text>
            </View>

            {documentLoading ? (
              <ActivityIndicator color="#2563EB" />
            ) : (
              <Text
                style={[
                  styles.downloadIcon,
                  isMine && styles.myText,
                ]}>
                ↓
              </Text>
            )}
          </TouchableOpacity>
        );

      default:
        return null;
    }
  };

  const isMediaMessage =
    message.messageType === 'image' ||
    message.messageType === 'video' ||
    message.messageType === 'document';

  return (
    <View
      style={[
        styles.container,
        isMine ? styles.myContainer : styles.otherContainer,
      ]}>
      <View
        style={[
          styles.bubble,
          isMine ? styles.myBubble : styles.otherBubble,
          isMediaMessage && styles.mediaBubble,
        ]}>
        {isMediaMessage && renderMedia()}

        {!!message.text && (
          <Text
            style={[
              styles.messageText,
              isMine ? styles.myText : styles.otherText,
            ]}>
            {message.text}
          </Text>
        )}
      </View>
    </View>
  );
};

export default MessageBubble;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 12,
    marginVertical: 5,
  },

  myContainer: {
    alignItems: 'flex-end',
  },

  otherContainer: {
    alignItems: 'flex-start',
  },

  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },

  myBubble: {
    backgroundColor: '#2563EB',
    borderBottomRightRadius: 3,
  },

  otherBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 3,
  },

  mediaBubble: {
    padding: 5,
  },

  messageText: {
    fontSize: 15,
    marginTop: 4,
  },

  myText: {
    color: '#FFFFFF',
  },

  otherText: {
    color: '#111827',
  },

  // Image
  image: {
    width: 220,
    height: 220,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },

  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },

  fullImage: {
    width: '100%',
    height: '85%',
  },

  closeButton: {
    position: 'absolute',
    top: 45,
    right: 20,
    zIndex: 10,
    padding: 12,
  },

  closeText: {
    color: '#FFFFFF',
    fontSize: 26,
  },

  // Video
  videoContainer: {
    width: 220,
    height: 150,
    borderRadius: 10,
    overflow: 'hidden',
  },

  videoPlaceholder: {
    flex: 1,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
  },

  videoIcon: {
    fontSize: 42,
    color: '#FFFFFF',
  },

  videoText: {
    color: '#FFFFFF',
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
  },

  videoFileName: {
    color: '#CBD5E1',
    fontSize: 10,
    marginTop: 5,
  },

  videoModal: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },

  videoPlayer: {
    width: '100%',
    height: '75%',
  },

  videoLoader: {
    position: 'absolute',
  },

  // Document
  documentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 210,
    maxWidth: 260,
    paddingVertical: 5,
  },

  documentIconContainer: {
    width: 42,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },

  documentIcon: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },

  documentInfo: {
    flex: 1,
    marginHorizontal: 10,
  },

  documentName: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '600',
  },

  documentSize: {
    color: '#64748B',
    fontSize: 10,
    marginTop: 4,
  },

  documentOpenText: {
    color: '#2563EB',
    fontSize: 10,
    marginTop: 4,
  },

  mySubText: {
    color: '#DBEAFE',
  },

  downloadIcon: {
    fontSize: 22,
    color: '#111827',
    fontWeight: 'bold',
  },
});
