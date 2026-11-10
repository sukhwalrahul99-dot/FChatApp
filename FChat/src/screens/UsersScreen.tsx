
import React, {useEffect, useMemo, useState} from 'react';

import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  TextInput,
  SafeAreaView,
} from 'react-native';

import {
  collection,
  onSnapshot,
  query,
  where,
} from '@react-native-firebase/firestore';

import {db} from '../services/firebase';
import {logoutUser} from '../services/authService';
import {UserProfile} from '../types';

interface GroupConversation {
  id: string;
  members: string[];
  type?: string;
  groupName?: string;
  createdBy?: string;
  lastMessage?: string;
  lastMessageType?: string;
  lastMessageAt?: any;
  updatedAt?: any;
  unreadCounts?: Record<string, number>;
}

interface ConversationData {
  members?: string[];
  type?: string;
  lastMessage?: string;
  lastMessageType?: string;
  lastMessageAt?: any;
  updatedAt?: any;
  unreadCounts?: Record<string, number>;
}

interface ChatItem {
  user: UserProfile;
  lastMessage: string;
  lastMessageAt: any;
  unreadCount: number;
  hasConversation: boolean;
}

interface UsersScreenProps {
  currentUserId: string;
  currentUserEmail: string;
  onUserSelect: (user: UserProfile) => void;
  onLogout: () => void;

  onCreateGroup?: () => void;
  onGroupSelect?: (group: GroupConversation) => void;
}

const UsersScreen: React.FC<UsersScreenProps> = ({
  currentUserId,
  currentUserEmail,
  onUserSelect,
  onLogout,
  onCreateGroup,
  onGroupSelect,
}) => {
  const [users, setUsers] = useState<UserProfile[]>([]);

  const [conversations, setConversations] = useState<
    Record<string, ConversationData>
  >({});

  const [groups, setGroups] = useState<GroupConversation[]>([]);

  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [searchText, setSearchText] = useState('');

  // Listen to registered users
  useEffect(() => {
    if (!currentUserId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      snapshot => {
        const userList: UserProfile[] = snapshot.docs
          .map(item => ({
            uid: item.id,
            ...(item.data() as Omit<UserProfile, 'uid'>),
          }))
          .filter(item => item.uid !== currentUserId);

        setUsers(userList);
        setLoading(false);
      },
      error => {
        console.log('Users Listener Error:', error);
        setLoading(false);
        Alert.alert('Firestore Error', error.message);
      },
    );

    return unsubscribe;
  }, [currentUserId]);

  // Listen to all conversations
  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    const conversationsQuery = query(
      collection(db, 'conversations'),
      where('members', 'array-contains', currentUserId),
    );

    const unsubscribe = onSnapshot(
      conversationsQuery,
      snapshot => {
        const conversationMap: Record<
          string,
          ConversationData
        > = {};

        const groupList: GroupConversation[] = [];

        snapshot.docs.forEach(item => {
          const data = item.data() as ConversationData;
          const members = data.members || [];

          // Group conversations
          if (data.type === 'group' || members.length > 2) {
            groupList.push({
              id: item.id,
              ...data,
              members,
            });
            return;
          }

          // Single conversations
          if (members.length === 2) {
            const otherUserId = members.find(
              uid => uid !== currentUserId,
            );

            if (otherUserId) {
              conversationMap[otherUserId] = data;
            }
          }
        });

        setConversations(conversationMap);

        groupList.sort((a, b) => {
          const dateA = a.lastMessageAt?.toDate
            ? a.lastMessageAt.toDate().getTime()
            : 0;

          const dateB = b.lastMessageAt?.toDate
            ? b.lastMessageAt.toDate().getTime()
            : 0;

          return dateB - dateA;
        });

        setGroups(groupList);
      },
      error => {
        console.log('Conversation Listener Error:', error);
        Alert.alert('Conversation Error', error.message);
      },
    );

    return unsubscribe;
  }, [currentUserId]);

  // Logout
  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }

    try {
      setLoggingOut(true);
      await logoutUser();
      onLogout();
    } catch (error: any) {
      Alert.alert(
        'Logout Failed',
        error.message || 'Unable to logout.',
      );
    } finally {
      setLoggingOut(false);
    }
  };

  // Format time
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

    const now = new Date();

    const sameDay =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (sameDay) {
      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    return date.toLocaleDateString([], {
      day: '2-digit',
      month: 'short',
    });
  };

  // Prepare and sort single chat list
  const chatList = useMemo(() => {
    const list: ChatItem[] = users.map(user => {
      const conversation = conversations[user.uid];

      const messageType = conversation?.lastMessageType;
      let lastMessage = conversation?.lastMessage || '';

      if (messageType === 'image') {
        lastMessage = 'Photo';
      } else if (messageType === 'video') {
        lastMessage = 'Video';
      } else if (messageType === 'document') {
        lastMessage = 'Document';
      }

      return {
        user,
        lastMessage,
        lastMessageAt:
          conversation?.lastMessageAt ||
          conversation?.updatedAt ||
          null,
        unreadCount: Number(
          conversation?.unreadCounts?.[currentUserId] || 0,
        ),
        hasConversation: !!conversation,
      };
    });

    return list.sort((a, b) => {
      if (a.hasConversation && !b.hasConversation) {
        return -1;
      }

      if (!a.hasConversation && b.hasConversation) {
        return 1;
      }

      const dateA = a.lastMessageAt?.toDate
        ? a.lastMessageAt.toDate().getTime()
        : 0;

      const dateB = b.lastMessageAt?.toDate
        ? b.lastMessageAt.toDate().getTime()
        : 0;

      return dateB - dateA;
    });
  }, [users, conversations, currentUserId]);

  // Search
  const filteredUsers = chatList.filter(item => {
    const name = item.user.name?.toLowerCase() || '';
    const email = item.user.email?.toLowerCase() || '';
    const search = searchText.toLowerCase().trim();

    return name.includes(search) || email.includes(search);
  });

  const filteredGroups = groups.filter(group =>
    (group.groupName || 'Group')
      .toLowerCase()
      .includes(searchText.toLowerCase().trim()),
  );

  // Current user initial
  const currentInitial = currentUserEmail
    ? currentUserEmail.charAt(0).toUpperCase()
    : 'U';

  const getInitial = (name?: string) => {
    return name?.trim()?.charAt(0)?.toUpperCase() || '?';
  };

  // Total unread messages
  const totalUnread =
    chatList.reduce(
      (total, item) => total + item.unreadCount,
      0,
    ) +
    groups.reduce(
      (total, group) =>
        total + Number(group.unreadCounts?.[currentUserId] || 0),
      0,
    );

  // Single chat item
  const renderChatItem = ({item}: {item: ChatItem}) => {
    const user = item.user;

    return (
      <TouchableOpacity
        style={styles.chatCard}
        activeOpacity={0.75}
        onPress={() => onUserSelect(user)}>

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {getInitial(user.name)}
          </Text>
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.chatTopRow}>
            <Text style={styles.userName} numberOfLines={1}>
              {user.name || user.email || 'User'}
            </Text>

            <Text
              style={[
                styles.chatTime,
                item.unreadCount > 0 && styles.unreadTime,
              ]}>
              {formatTime(item.lastMessageAt)}
            </Text>
          </View>

          <View style={styles.chatBottomRow}>
            <Text
              style={[
                styles.lastMessage,
                item.unreadCount > 0 && styles.unreadMessage,
              ]}
              numberOfLines={1}>
              {item.lastMessage ||
                user.email ||
                'Start a conversation'}
            </Text>

            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {item.unreadCount > 99
                    ? '99+'
                    : item.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Group item
  const renderGroupItem = ({item}: {item: GroupConversation}) => {
    const unreadCount = Number(
      item.unreadCounts?.[currentUserId] || 0,
    );

    let lastMessage = item.lastMessage || 'Group conversation';

    if (item.lastMessageType === 'image') {
      lastMessage = 'Photo';
    } else if (item.lastMessageType === 'video') {
      lastMessage = 'Video';
    } else if (item.lastMessageType === 'document') {
      lastMessage = 'Document';
    }

    return (
      <TouchableOpacity
        style={styles.chatCard}
        activeOpacity={0.75}
        onPress={() => {
          if (onGroupSelect) {
            onGroupSelect(item);
          } else {
            Alert.alert(
              'Group Chat',
              'Group Chat screen is not connected yet.',
            );
          }
        }}>

        <View style={styles.groupAvatar}>
          <Text style={styles.groupAvatarText}>
            {getInitial(item.groupName)}
          </Text>
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.chatTopRow}>
            <Text style={styles.userName} numberOfLines={1}>
              {item.groupName || 'Unnamed Group'}
            </Text>

            <Text
              style={[
                styles.chatTime,
                unreadCount > 0 && styles.unreadTime,
              ]}>
              {formatTime(item.lastMessageAt || item.updatedAt)}
            </Text>
          </View>

          <View style={styles.chatBottomRow}>
            <Text
              style={[
                styles.lastMessage,
                unreadCount > 0 && styles.unreadMessage,
              ]}
              numberOfLines={1}>
              {lastMessage} · {item.members?.length || 0} members
            </Text>

            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.brandContainer}>
              <View style={styles.logo}>
                <Text style={styles.logoText}>C</Text>
              </View>

              <View>
                <Text style={styles.brandTitle}>
                  ChatConnect
                </Text>

                <Text style={styles.brandSubtitle}>
                  Your private conversations
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              disabled={loggingOut}
              activeOpacity={0.8}>
              {loggingOut ? (
                <ActivityIndicator
                  size="small"
                  color="#DC2626"
                />
              ) : (
                <Text style={styles.logoutText}>
                  Logout
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Profile */}
          <View style={styles.profileCard}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileInitial}>
                {currentInitial}
              </Text>
            </View>

            <View style={styles.profileInfo}>
              <Text style={styles.profileLabel}>
                LOGGED IN AS
              </Text>

              <Text
                style={styles.profileEmail}
                numberOfLines={1}>
                {currentUserEmail}
              </Text>

              <View style={styles.onlineRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>
                  Account active
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Main Content */}
        <View style={styles.content}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>
                Chats
              </Text>

              <Text style={styles.sectionSubtitle}>
                Your recent conversations
              </Text>
            </View>

            <View style={styles.countBadge}>
              <Text style={styles.countText}>
                {totalUnread > 0 ? totalUnread : users.length + groups.length}
              </Text>
            </View>
          </View>

          {/* Create Group Button */}
          <TouchableOpacity
            style={styles.createGroupButton}
            activeOpacity={0.8}
            onPress={() => {
              if (onCreateGroup) {
                onCreateGroup();
              } else {
                Alert.alert(
                  'Create Group',
                  'Create Group screen is not connected yet.',
                );
              }
            }}>
            <View style={styles.createGroupIcon}>
              <Text style={styles.createGroupIconText}>+</Text>
            </View>

            <View style={styles.createGroupInfo}>
              <Text style={styles.createGroupTitle}>
                Create New Group
              </Text>
              <Text style={styles.createGroupSubtitle}>
                Start a conversation with multiple members
              </Text>
            </View>

            <Text style={styles.createGroupArrow}>›</Text>
          </TouchableOpacity>

          {/* Search */}
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>⌕</Text>

            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or email..."
              placeholderTextColor="#94A3B8"
              value={searchText}
              onChangeText={setSearchText}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {searchText.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchText('')}
                style={styles.clearButton}>
                <Text style={styles.clearText}>×</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator
                size="large"
                color="#2563EB"
              />

              <Text style={styles.loadingText}>
                Loading members...
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredUsers}
              keyExtractor={item => item.user.uid}
              renderItem={renderChatItem}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={
                <>
                  {filteredGroups.length > 0 && (
                    <View style={styles.listSection}>
                      <Text style={styles.listSectionTitle}>
                        Groups ({filteredGroups.length})
                      </Text>

                      {filteredGroups.map(group => (
                        <View key={group.id}>
                          {renderGroupItem({item: group})}
                        </View>
                      ))}
                    </View>
                  )}

                  <Text style={styles.listSectionTitle}>
                    Members ({filteredUsers.length})
                  </Text>
                </>
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIconContainer}>
                    <Text style={styles.emptyIcon}>
                      {searchText ? '⌕' : '♧'}
                    </Text>
                  </View>

                  <Text style={styles.emptyTitle}>
                    {searchText
                      ? 'No Members Found'
                      : 'No Members Yet'}
                  </Text>

                  <Text style={styles.emptySubtitle}>
                    {searchText
                      ? 'Try searching with another name or email.'
                      : 'Register another account to start your first conversation.'}
                  </Text>

                  {searchText.length > 0 && (
                    <TouchableOpacity
                      style={styles.resetButton}
                      onPress={() => setSearchText('')}>
                      <Text style={styles.resetButtonText}>
                        Clear Search
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              }
            />
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            ChatConnect
          </Text>

          <View style={styles.footerDot} />

          <Text style={styles.footerSubtext}>
            Private messaging
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default UsersScreen;

// Styles
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
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    elevation: 3,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 3,
    },
  },
  headerTop: {
    marginTop: 10,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  logoText: {
    fontSize: 23,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  brandTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#172554',
  },
  brandSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
  },
  logoutButton: {
    minWidth: 76,
    height: 38,
    paddingHorizontal: 13,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  profileInitial: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1D4ED8',
  },
  profileInfo: {
    flex: 1,
  },
  profileLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#94A3B8',
  },
  profileEmail: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 4,
  },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 6,
  },
  onlineText: {
    fontSize: 10,
    color: '#16A34A',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 23,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 17,
  },
  sectionTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: '#172554',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 5,
  },
  countBadge: {
    minWidth: 35,
    height: 35,
    borderRadius: 12,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  countText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2563EB',
  },
  createGroupButton: {
    minHeight: 67,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  createGroupIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  createGroupIconText: {
    fontSize: 27,
    color: '#FFFFFF',
    lineHeight: 31,
    fontWeight: '400',
  },
  createGroupInfo: {
    flex: 1,
  },
  createGroupTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E40AF',
  },
  createGroupSubtitle: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 4,
  },
  createGroupArrow: {
    fontSize: 27,
    color: '#2563EB',
    marginLeft: 5,
  },
  searchContainer: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 18,
  },
  searchIcon: {
    fontSize: 27,
    color: '#64748B',
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: '#1E293B',
    fontSize: 13,
    paddingVertical: 0,
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    color: '#475569',
    fontSize: 21,
    lineHeight: 25,
  },
  listContent: {
    paddingBottom: 18,
  },
  listSection: {
    marginBottom: 8,
  },
  listSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 10,
    marginTop: 4,
  },
  chatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 13,
    borderRadius: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#2563EB',
  },
  groupAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  groupAvatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#15803D',
  },
  chatInfo: {
    flex: 1,
  },
  chatTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#172554',
    marginRight: 8,
  },
  chatTime: {
    fontSize: 10,
    color: '#94A3B8',
  },
  unreadTime: {
    color: '#16A34A',
    fontWeight: '700',
  },
  chatBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 7,
  },
  lastMessage: {
    flex: 1,
    fontSize: 12,
    color: '#64748B',
    marginRight: 8,
  },
  unreadMessage: {
    color: '#334155',
    fontWeight: '700',
  },
  unreadBadge: {
    minWidth: 21,
    height: 21,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 12,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 25,
    paddingVertical: 25,
  },
  emptyIconContainer: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  emptyIcon: {
    fontSize: 38,
    color: '#2563EB',
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#172554',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 21,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 9,
  },
  resetButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 18,
  },
  resetButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  footer: {
    minHeight: 42,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  footerText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  footerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#94A3B8',
    marginHorizontal: 8,
  },
  footerSubtext: {
    fontSize: 10,
    color: '#94A3B8',
  },
});
