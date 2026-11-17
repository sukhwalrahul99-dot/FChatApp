
import React, {useEffect, useMemo, useState} from 'react';
import {SafeAreaView} from 'react-native-safe-area-context';

import {
  MessagesSquare,
  Users,
  UserRound,
  ArrowLeft,
  LogOut,
  Mail,
  ShieldCheck,
  Search,
  Plus,
  ChevronRight,
} from 'lucide-react-native';

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
  ScrollView,
} from 'react-native';

import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
} from '@react-native-firebase/firestore';

import {db} from '../services/firebase';
import {logoutUser} from '../services/authService';
import {UserProfile} from '../types';

// ============================================
// INTERFACES
// ============================================

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

interface CurrentUserData {
  name?: string;
  email?: string;
  displayName?: string;
  createdAt?: any;
}

type ActiveTab = 'all' | 'groups';

type CombinedChatItem =
  | {
      kind: 'user';
      id: string;
      chat: ChatItem;
    }
  | {
      kind: 'group';
      id: string;
      group: GroupConversation;
    };

interface UsersScreenProps {
  currentUserId: string;
  currentUserEmail: string;
  onUserSelect: (user: UserProfile) => void;
  onLogout: () => void;
  onCreateGroup?: () => void;
  onGroupSelect?: (group: GroupConversation) => void;
}

// ============================================
// HELPER
// ============================================

const getTimestamp = (timestamp: any): number => {
  if (!timestamp) {
    return 0;
  }

  const date = timestamp?.toDate
    ? timestamp.toDate()
    : new Date(timestamp);

  const time = date.getTime();

  return Number.isNaN(time) ? 0 : time;
};

// ============================================
// MAIN COMPONENT
// ============================================

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
  const [activeTab, setActiveTab] = useState<ActiveTab>('all');

  // Profile state
  const [showProfile, setShowProfile] = useState(false);
  const [currentUserData, setCurrentUserData] =
    useState<CurrentUserData>({});

  // ============================================
  // LISTEN TO CURRENT USER PROFILE
  // ============================================

  useEffect(() => {
    if (!currentUserId) {
      setCurrentUserData({});
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, 'users', currentUserId),
      snapshot => {
        if (snapshot.exists()) {
          setCurrentUserData(
            snapshot.data() as CurrentUserData,
          );
        } else {
          setCurrentUserData({});
        }
      },
      error => {
        console.log('Profile Listener Error:', error);
      },
    );

    return unsubscribe;
  }, [currentUserId]);

  // ============================================
  // LISTEN TO REGISTERED USERS
  // ============================================

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

  // ============================================
  // LISTEN TO CONVERSATIONS AND GROUPS
  // ============================================

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

          if (data.type === 'group' || members.length > 2) {
            groupList.push({
              id: item.id,
              ...data,
              members,
            });

            return;
          }

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
          const dateA = getTimestamp(
            a.lastMessageAt || a.updatedAt,
          );

          const dateB = getTimestamp(
            b.lastMessageAt || b.updatedAt,
          );

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

  // ============================================
  // LOGOUT
  // ============================================

  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }

    Alert.alert(
      'Logout',
      'Are you sure you want to logout from NexTalk?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
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
          },
        },
      ],
    );
  };

  // ============================================
  // FORMAT TIME
  // ============================================

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

  // ============================================
  // PREPARE INDIVIDUAL CHAT LIST
  // ============================================

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

      return (
        getTimestamp(b.lastMessageAt) -
        getTimestamp(a.lastMessageAt)
      );
    });
  }, [users, conversations, currentUserId]);

  // ============================================
  // SEARCH
  // ============================================

  const search = searchText.toLowerCase().trim();

  const filteredGroups = groups.filter(group =>
    (group.groupName || 'Group')
      .toLowerCase()
      .includes(search),
  );

  // ============================================
  // COMBINE USERS AND GROUPS
  // ============================================

  const allChatItems = useMemo<CombinedChatItem[]>(() => {
    const combined: CombinedChatItem[] = [
      ...chatList.map(item => ({
        kind: 'user' as const,
        id: item.user.uid,
        chat: item,
      })),

      ...groups.map(group => ({
        kind: 'group' as const,
        id: group.id,
        group,
      })),
    ];

    return combined.sort((a, b) => {
      const timeA =
        a.kind === 'user'
          ? getTimestamp(a.chat.lastMessageAt)
          : getTimestamp(
              a.group.lastMessageAt || a.group.updatedAt,
            );

      const timeB =
        b.kind === 'user'
          ? getTimestamp(b.chat.lastMessageAt)
          : getTimestamp(
              b.group.lastMessageAt || b.group.updatedAt,
            );

      return timeB - timeA;
    });
  }, [chatList, groups]);

  const filteredAllChats = useMemo(() => {
    return allChatItems.filter(item => {
      if (item.kind === 'user') {
        const name =
          item.chat.user.name?.toLowerCase() || '';

        const email =
          item.chat.user.email?.toLowerCase() || '';

        return name.includes(search) || email.includes(search);
      }

      return (item.group.groupName || 'Group')
        .toLowerCase()
        .includes(search);
    });
  }, [allChatItems, search]);

  // ============================================
  // PROFILE HELPERS
  // ============================================

  const currentName =
    currentUserData.name?.trim() ||
    currentUserData.displayName?.trim() ||
    currentUserEmail.split('@')[0] ||
    'User';

  const currentEmail =
    currentUserData.email ||
    currentUserEmail ||
    'No email available';

  const currentInitial =
    currentName.charAt(0).toUpperCase() || 'U';

  const getInitial = (name?: string) => {
    return name?.trim()?.charAt(0)?.toUpperCase() || '?';
  };

  const totalUnread =
    chatList.reduce(
      (total, item) => total + item.unreadCount,
      0,
    ) +
    groups.reduce(
      (total, group) =>
        total +
        Number(group.unreadCounts?.[currentUserId] || 0),
      0,
    );

  // ============================================
  // RENDER INDIVIDUAL CHAT ITEM
  // ============================================

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

  // ============================================
  // RENDER GROUP ITEM
  // ============================================

  const renderGroupItem = ({
    item,
  }: {
    item: GroupConversation;
  }) => {
    const unreadCount = Number(
      item.unreadCounts?.[currentUserId] || 0,
    );

    let lastMessage =
      item.lastMessage || 'Group conversation';

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
          <Users size={23} color="#15803D" />
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
              {formatTime(
                item.lastMessageAt || item.updatedAt,
              )}
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

  // ============================================
  // EMPTY STATE
  // ============================================

  const renderEmptyState = (
    title: string,
    subtitle: string,
  ) => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <MessagesSquare size={34} color="#2563EB" />
      </View>

      <Text style={styles.emptyTitle}>{title}</Text>

      <Text style={styles.emptySubtitle}>{subtitle}</Text>

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
  );

  // ============================================
  // PROFILE SCREEN
  // ============================================

  const renderProfileScreen = () => (
    <View style={styles.profileScreen}>
      <View style={styles.profileHeader}>
        <TouchableOpacity
          style={styles.profileBackButton}
          onPress={() => setShowProfile(false)}>
          <ArrowLeft size={22} color="#172554" />
        </TouchableOpacity>

        <Text style={styles.profileHeaderTitle}>
          My Profile
        </Text>

        <View style={styles.headerPlaceholder} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.profileScrollContent}>

        {/* PROFILE DETAILS */}

        <View style={styles.profileMain}>
          <View style={styles.largeProfileAvatar}>
            <Text style={styles.largeProfileInitial}>
              {currentInitial}
            </Text>
          </View>

          <Text style={styles.profileName}>
            {currentName}
          </Text>

          <Text style={styles.profileEmailSubtitle}>
            {currentEmail}
          </Text>

          <View style={styles.accountActiveBadge}>
            <View style={styles.onlineDot} />

            <Text style={styles.accountActiveText}>
              Active Account
            </Text>
          </View>
        </View>

        {/* ACCOUNT INFORMATION */}

        <View style={styles.detailsCard}>
          <Text style={styles.detailsHeading}>
            ACCOUNT INFORMATION
          </Text>

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <UserRound size={20} color="#2563EB" />
            </View>

            <View style={styles.detailInfo}>
              <Text style={styles.detailLabel}>
                Full Name
              </Text>

              <Text style={styles.detailValue}>
                {currentName}
              </Text>
            </View>
          </View>

          <View style={styles.detailDivider} />

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Mail size={20} color="#2563EB" />
            </View>

            <View style={styles.detailInfo}>
              <Text style={styles.detailLabel}>
                Email Address
              </Text>

              <Text style={styles.detailValue}>
                {currentEmail}
              </Text>
            </View>
          </View>

          <View style={styles.detailDivider} />

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <ShieldCheck size={20} color="#2563EB" />
            </View>

            <View style={styles.detailInfo}>
              <Text style={styles.detailLabel}>
                Account Status
              </Text>

              <Text style={styles.activeDetailValue}>
                Active
              </Text>
            </View>
          </View>

          <View style={styles.detailDivider} />

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <UserRound size={20} color="#2563EB" />
            </View>

            <View style={styles.detailInfo}>
              <Text style={styles.detailLabel}>
                User ID
              </Text>

              <Text
                style={styles.userIdValue}
                selectable>
                {currentUserId}
              </Text>
            </View>
          </View>
        </View>

        {/* APP INFORMATION - WITHOUT N LOGO */}

        <View style={styles.appInfoCard}>
          <View style={styles.appInfoText}>
            <Text style={styles.appInfoTitle}>
              NexTalk
            </Text>

            <Text style={styles.appInfoSubtitle}>
              Stay connected, anytime.
            </Text>
          </View>

          <Text style={styles.versionText}>
            v1.0
          </Text>
        </View>

        {/* LOGOUT */}

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          disabled={loggingOut}
          activeOpacity={0.8}>

          {loggingOut ? (
            <ActivityIndicator color="#DC2626" />
          ) : (
            <>
              <LogOut size={19} color="#DC2626" />

              <Text style={styles.logoutText}>
                Logout
              </Text>

              <ChevronRight size={18} color="#DC2626" />
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  // ============================================
  // MAIN UI
  // ============================================

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'bottom']}>

      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F8FAFC"
        translucent={false}
      />

      <View style={styles.container}>
        {showProfile ? (
          renderProfileScreen()
        ) : (
          <>
            {/* HEADER */}

            <View style={styles.header}>
              <View style={styles.headerTop}>
                <View style={styles.brandContainer}>
                  <View>
                    <Text style={styles.brandTitle}>
                      NexTalk
                    </Text>

                    <Text style={styles.brandSubtitle}>
                      Stay connected
                    </Text>
                  </View>
                </View>

                {/* CIRCULAR PROFILE BUTTON */}

                <TouchableOpacity
                  style={styles.profileButton}
                  onPress={() => setShowProfile(true)}
                  activeOpacity={0.8}>

                  <Text style={styles.profileButtonInitial}>
                    {currentInitial}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* MAIN CONTENT */}

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
                    {totalUnread > 0
                      ? totalUnread
                      : users.length + groups.length}
                  </Text>
                </View>
              </View>

              {/* CREATE GROUP BUTTON */}

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
                  <Plus size={23} color="#FFFFFF" />
                </View>

                <View style={styles.createGroupInfo}>
                  <Text style={styles.createGroupTitle}>
                    Create New Group
                  </Text>

                  <Text style={styles.createGroupSubtitle}>
                    Start a conversation with multiple members
                  </Text>
                </View>

                <ChevronRight size={21} color="#2563EB" />
              </TouchableOpacity>

              {/* SEARCH */}

              <View style={styles.searchContainer}>
                <Search size={20} color="#64748B" />

                <TextInput
                  style={styles.searchInput}
                  placeholder={
                    activeTab === 'all'
                      ? 'Search users and groups...'
                      : 'Search groups...'
                  }
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

              {/* CHAT LIST */}

              {loading ? (
                <View style={styles.loaderContainer}>
                  <ActivityIndicator
                    size="large"
                    color="#2563EB"
                  />

                  <Text style={styles.loadingText}>
                    Loading conversations...
                  </Text>
                </View>
              ) : activeTab === 'all' ? (
                <FlatList
                  data={filteredAllChats}
                  keyExtractor={item => `${item.kind}-${item.id}`}
                  renderItem={({item}) =>
                    item.kind === 'user'
                      ? renderChatItem({item: item.chat})
                      : renderGroupItem({item: item.group})
                  }
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.listContent}
                  ListHeaderComponent={
                    <Text style={styles.listSectionTitle}>
                      Recent Conversations ({filteredAllChats.length})
                    </Text>
                  }
                  ListEmptyComponent={
                    renderEmptyState(
                      searchText
                        ? 'No Results Found'
                        : 'No Conversations Yet',
                      searchText
                        ? 'Try searching with another name or group.'
                        : 'Start chatting with a member or create a group.',
                    )
                  }
                />
              ) : (
                <FlatList
                  data={filteredGroups}
                  keyExtractor={item => item.id}
                  renderItem={renderGroupItem}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.listContent}
                  ListHeaderComponent={
                    <Text style={styles.listSectionTitle}>
                      Groups ({filteredGroups.length})
                    </Text>
                  }
                  ListEmptyComponent={
                    renderEmptyState(
                      searchText
                        ? 'No Groups Found'
                        : 'No Groups Yet',
                      searchText
                        ? 'Try searching with another group name.'
                        : 'Create a group to start a group conversation.',
                    )
                  }
                />
              )}
            </View>

            {/* BOTTOM NAVIGATION */}

            <View style={styles.bottomTabContainer}>
              <TouchableOpacity
                style={styles.bottomTabButton}
                onPress={() => setActiveTab('all')}
                activeOpacity={0.75}>

                <MessagesSquare
                  size={24}
                  color={
                    activeTab === 'all' ? '#2563EB' : '#94A3B8'
                  }
                />

                <Text
                  style={[
                    styles.bottomTabText,
                    activeTab === 'all' &&
                      styles.bottomTabTextActive,
                  ]}>
                  Chats
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.bottomTabButton}
                onPress={() => setActiveTab('groups')}
                activeOpacity={0.75}>

                <Users
                  size={24}
                  color={
                    activeTab === 'groups' ? '#2563EB' : '#94A3B8'
                  }
                />

                <Text
                  style={[
                    styles.bottomTabText,
                    activeTab === 'groups' &&
                      styles.bottomTabTextActive,
                  ]}>
                  Groups
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

export default UsersScreen;

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // HEADER

  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 17,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  brandTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#2563EB',
    letterSpacing: 0.5,
  },

  brandSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
  },

  // CIRCULAR PROFILE BUTTON

  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },

  profileButtonInitial: {
    fontSize: 19,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },

  // MAIN CONTENT

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

  // CREATE GROUP

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

  // SEARCH

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
    gap: 10,
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

  // CHAT LIST

  listContent: {
    paddingBottom: 18,
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

  // LOADER

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

  // EMPTY STATE

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

  // BOTTOM NAVIGATION

  bottomTabContainer: {
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 25,
    paddingBottom: 5,
  },

  bottomTabButton: {
    flex: 1,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },

  bottomTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },

  bottomTabTextActive: {
    color: '#2563EB',
    fontWeight: '800',
  },

  // PROFILE SCREEN

  profileScreen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  profileHeader: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },

  profileBackButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },

  profileHeaderTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#172554',
  },

  headerPlaceholder: {
    width: 40,
  },

  profileScrollContent: {
    padding: 18,
    paddingBottom: 30,
  },

  profileMain: {
    alignItems: 'center',
    paddingVertical: 25,
  },

  largeProfileAvatar: {
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: '#DBEAFE',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },

  largeProfileInitial: {
    fontSize: 38,
    fontWeight: '800',
    color: '#2563EB',
  },

  profileName: {
    fontSize: 21,
    fontWeight: '800',
    color: '#172554',
    marginTop: 15,
  },

  profileEmailSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
  },

  accountActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginTop: 12,
  },

  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#16A34A',
    marginRight: 7,
  },

  accountActiveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },

  // ACCOUNT DETAILS

  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 17,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  detailsHeading: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#94A3B8',
    marginBottom: 8,
  },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
  },

  detailIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  detailInfo: {
    flex: 1,
  },

  detailLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 5,
  },

  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#172554',
  },

  activeDetailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16A34A',
  },

  userIdValue: {
    fontSize: 10,
    fontWeight: '600',
    color: '#172554',
  },

  detailDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },

  // APP INFORMATION

  appInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 15,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  appInfoText: {
    flex: 1,
  },

  appInfoTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#172554',
  },

  appInfoSubtitle: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
  },

  versionText: {
    fontSize: 10,
    color: '#94A3B8',
  },

  // LOGOUT

  logoutButton: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    paddingHorizontal: 16,
    marginTop: 20,
    gap: 10,
  },

  logoutText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
  },
});
