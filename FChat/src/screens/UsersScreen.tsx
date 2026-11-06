
import React, {useEffect, useState} from 'react';

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
} from '@react-native-firebase/firestore';

import {db} from '../services/firebase';
import {logoutUser} from '../services/authService';

import {UserProfile} from '../types';
import UserCard from '../components/UserCard';

interface UsersScreenProps {
  currentUserId: string;
  currentUserEmail: string;
  onUserSelect: (user: UserProfile) => void;
  onLogout: () => void;
}

const UsersScreen: React.FC<UsersScreenProps> = ({
  currentUserId,
  currentUserEmail,
  onUserSelect,
  onLogout,
}) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [searchText, setSearchText] = useState('');

  // Real-time Users
  useEffect(() => {
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
        setLoading(false);
        Alert.alert('Firestore Error', error.message);
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

  // Search Filter
  const filteredUsers = users.filter(user => {
    const name = user.name?.toLowerCase() || '';
    const email = user.email?.toLowerCase() || '';
    const search = searchText.toLowerCase().trim();

    return name.includes(search) || email.includes(search);
  });

  // User Avatar Initial
  const getInitial = (name?: string) => {
    return name?.trim()?.charAt(0)?.toUpperCase() || '?';
  };

  // Current User Initial
  const currentInitial = currentUserEmail
    ? currentUserEmail.charAt(0).toUpperCase()
    : 'U';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.container}>

        {/* Premium Header */}
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

          {/* Section Heading */}
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>
                Members
              </Text>

              <Text style={styles.sectionSubtitle}>
                Connect and start a conversation
              </Text>
            </View>

            <View style={styles.countBadge}>
              <Text style={styles.countText}>
                {users.length}
              </Text>
            </View>
          </View>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <Text style={styles.searchIcon}>
              ⌕
            </Text>

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

          {/* Members List */}
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
              keyExtractor={item => item.uid}
              renderItem={({item}) => (
                <View style={styles.userCardWrapper}>
                  <UserCard
                    user={item}
                    onPress={() => onUserSelect(item)}
                  />
                </View>
              )}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={[
                styles.listContent,
                filteredUsers.length === 0 &&
                  styles.emptyListContent,
              ]}
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

        {/* Bottom Footer */}
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

  // Header
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
    margin: 25,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
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

  // Profile Card
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

  // Content
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

  // Search
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

  // User List
  listContent: {
    paddingBottom: 18,
  },

  userCardWrapper: {
    marginBottom: 10,
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

  // Empty State
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 25,
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

  // Footer
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
