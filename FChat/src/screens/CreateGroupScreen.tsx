
import React, {useEffect, useMemo, useState} from 'react';

import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {SafeAreaView} from 'react-native-safe-area-context';

import {
  collection,
  onSnapshot,
} from '@react-native-firebase/firestore';

import {Search, X, Users, ArrowLeft} from 'lucide-react-native';

import {db} from '../services/firebase';
import {UserProfile} from '../types';
import {createGroupConversation} from '../services/chatService';

interface CreateGroupScreenProps {
  currentUserId: string;
  onBack: () => void;
  onGroupCreated: () => void;
}

const CreateGroupScreen: React.FC<CreateGroupScreenProps> = ({
  currentUserId,
  onBack,
  onGroupCreated,
}) => {
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [searchText, setSearchText] = useState('');

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Listen to registered users
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'users'),
      snapshot => {
        const userList: UserProfile[] = snapshot.docs
          .map(item => ({
            uid: item.id,
            ...(item.data() as Omit<UserProfile, 'uid'>),
          }))
          .filter(user => user.uid !== currentUserId);

        setUsers(userList);
        setLoading(false);
      },
      error => {
        console.log('Group Users Error:', error);
        setLoading(false);

        Alert.alert(
          'Error',
          'Unable to load registered users.',
        );
      },
    );

    return unsubscribe;
  }, [currentUserId]);

  // Search users by name or email
  const filteredUsers = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) {
      return users;
    }

    return users.filter(user => {
      const name = user.name?.toLowerCase() || '';
      const email = user.email?.toLowerCase() || '';

      return (
        name.includes(query) ||
        email.includes(query)
      );
    });
  }, [users, searchText]);

  // Get selected user details
  const selectedUsers = useMemo(() => {
    return selectedMembers
      .map(uid => users.find(user => user.uid === uid))
      .filter((user): user is UserProfile => Boolean(user));
  }, [selectedMembers, users]);

  // Select or unselect a member
  const toggleMember = (uid: string) => {
    setSelectedMembers(previous => {
      if (previous.includes(uid)) {
        return previous.filter(id => id !== uid);
      }

      return [...previous, uid];
    });
  };

  // Remove selected member
  const removeMember = (uid: string) => {
    setSelectedMembers(previous =>
      previous.filter(id => id !== uid),
    );
  };

  // Create group
  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Validation', 'Please enter a group name.');
      return;
    }

    if (selectedMembers.length < 2) {
      Alert.alert(
        'Validation',
        'Please select at least 2 members.',
      );
      return;
    }

    try {
      setCreating(true);

      const memberIds = [
        currentUserId,
        ...selectedMembers,
      ];

      await createGroupConversation(
        groupName.trim(),
        memberIds,
        currentUserId,
      );

      Alert.alert(
        'Success',
        'Your group has been created successfully.',
        [
          {
            text: 'OK',
            onPress: onGroupCreated,
          },
        ],
      );
    } catch (error: any) {
      console.log('Create Group Error:', error);

      Alert.alert(
        'Group Creation Failed',
        error?.message || 'Unable to create group.',
      );
    } finally {
      setCreating(false);
    }
  };

  // Render selected member chip
  const renderSelectedMember = (user: UserProfile) => {
    const initial =
      user.name?.trim()?.charAt(0)?.toUpperCase() || '?';

    return (
      <View key={user.uid} style={styles.selectedChip}>
        <View style={styles.selectedAvatar}>
          <Text style={styles.selectedAvatarText}>
            {initial}
          </Text>
        </View>

        <Text style={styles.selectedName} numberOfLines={1}>
          {user.name || 'User'}
        </Text>

        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => removeMember(user.uid)}
          disabled={creating}>
          <X size={13} color="#64748B" />
        </TouchableOpacity>
      </View>
    );
  };

  // Render user list item
  const renderUser = ({item}: {item: UserProfile}) => {
    const selected = selectedMembers.includes(item.uid);

    const initial =
      item.name?.trim()?.charAt(0)?.toUpperCase() || '?';

    return (
      <TouchableOpacity
        style={[
          styles.userCard,
          selected && styles.selectedUserCard,
        ]}
        activeOpacity={0.75}
        onPress={() => toggleMember(item.uid)}
        disabled={creating}>

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {initial}
          </Text>
        </View>

        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {item.name || 'User'}
          </Text>

          <Text style={styles.userEmail} numberOfLines={1}>
            {item.email || 'No email available'}
          </Text>
        </View>

        <View
          style={[
            styles.checkbox,
            selected && styles.checkboxSelected,
          ]}>
          {selected && (
            <Text style={styles.checkmark}>✓</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'bottom']}>

      <StatusBar
        backgroundColor="#F8FAFC"
        barStyle="dark-content"
        translucent={false}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            disabled={creating}>
            <ArrowLeft size={21} color="#2563EB" />
          </TouchableOpacity>

          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>
              Create Group
            </Text>

            <Text style={styles.headerSubtitle}>
              Start a conversation with your people
            </Text>
          </View>

          <View style={styles.headerIcon}>
            <Users size={22} color="#2563EB" />
          </View>
        </View>

        <View style={styles.content}>

          {/* Group Details */}
          <View style={styles.detailsCard}>
            <Text style={styles.sectionTitle}>
              Group Details
            </Text>

            <Text style={styles.label}>
              GROUP NAME *
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Enter group name"
              placeholderTextColor="#94A3B8"
              value={groupName}
              onChangeText={setGroupName}
              maxLength={50}
              editable={!creating}
            />

            <View style={styles.descriptionHeader}>
              <Text style={styles.label}>
                DESCRIPTION
              </Text>

              <Text style={styles.characterCount}>
                {groupDescription.length}/150
              </Text>
            </View>

            <TextInput
              style={styles.descriptionInput}
              placeholder="What is this group about? (Optional)"
              placeholderTextColor="#94A3B8"
              value={groupDescription}
              onChangeText={setGroupDescription}
              maxLength={150}
              multiline
              textAlignVertical="top"
              editable={!creating}
            />
          </View>

          {/* Member Selection Header */}
          <View style={styles.memberHeader}>
            <View>
              <Text style={styles.sectionTitle}>
                Add Members
              </Text>

              <Text style={styles.sectionSubtitle}>
                Select at least 2 people
              </Text>
            </View>

            <View style={styles.selectedBadge}>
              <Text style={styles.selectedBadgeText}>
                {selectedMembers.length} Selected
              </Text>
            </View>
          </View>

          {/* Selected Members */}
          {selectedUsers.length > 0 && (
            <View style={styles.selectedSection}>
              <Text style={styles.selectedHeading}>
                SELECTED MEMBERS
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.selectedList}>
                {selectedUsers.map(renderSelectedMember)}
              </ScrollView>
            </View>
          )}

          {/* Search */}
          <View style={styles.searchContainer}>
            <Search size={19} color="#94A3B8" />

            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or email..."
              placeholderTextColor="#94A3B8"
              value={searchText}
              onChangeText={setSearchText}
              editable={!creating}
            />

            {searchText.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchText('')}>
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>

          {/* User List Heading */}
          <View style={styles.listHeading}>
            <Text style={styles.listHeadingText}>
              AVAILABLE CONTACTS
            </Text>

            <Text style={styles.totalUsers}>
              {filteredUsers.length} users
            </Text>
          </View>

          {/* User List */}
          {loading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator
                size="large"
                color="#2563EB"
              />

              <Text style={styles.loadingText}>
                Loading users...
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredUsers}
              keyExtractor={item => item.uid}
              renderItem={renderUser}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIcon}>
                    <Users size={27} color="#94A3B8" />
                  </View>

                  <Text style={styles.emptyTitle}>
                    {searchText
                      ? 'No Matching Users'
                      : 'No Users Found'}
                  </Text>

                  <Text style={styles.emptySubtitle}>
                    {searchText
                      ? 'Try searching with another name or email.'
                      : 'Register more users to create a group.'}
                  </Text>
                </View>
              }
            />
          )}

          {/* Create Group Button */}
          <View style={styles.bottomContainer}>
            <TouchableOpacity
              style={[
                styles.createButton,
                creating && styles.disabledButton,
              ]}
              activeOpacity={0.85}
              disabled={creating}
              onPress={handleCreateGroup}>

              {creating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Users size={19} color="#FFFFFF" />

                  <Text style={styles.createButtonText}>
                    Create Group
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.bottomHint}>
              {selectedMembers.length < 2
                ? `Select ${2 - selectedMembers.length} more member(s) to continue`
                : `${selectedMembers.length + 1} people will be in this group, including you`}
            </Text>
          </View>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default CreateGroupScreen;

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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 17,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  headerInfo: {
    flex: 1,
  },

  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#172554',
  },

  headerSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },

  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },

  // Group details
  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 19,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#172554',
  },

  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#64748B',
    marginTop: 15,
    marginBottom: 8,
  },

  input: {
    height: 45,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    color: '#172554',
    fontSize: 13,
  },

  descriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  characterCount: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 15,
    marginBottom: 8,
  },

  descriptionInput: {
    minHeight: 65,
    maxHeight: 90,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingTop: 11,
    color: '#172554',
    fontSize: 13,
  },

  // Member heading
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  sectionSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },

  selectedBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
  },

  selectedBadgeText: {
    fontSize: 10,
    color: '#1D4ED8',
    fontWeight: '800',
  },

  // Selected members
  selectedSection: {
    marginBottom: 13,
  },

  selectedHeading: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#64748B',
    marginBottom: 9,
  },

  selectedList: {
    paddingRight: 8,
    gap: 8,
  },

  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 25,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 9,
  },

  selectedAvatar: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },

  selectedAvatarText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  selectedName: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1E40AF',
    maxWidth: 85,
    marginLeft: 6,
  },

  removeButton: {
    marginLeft: 5,
    padding: 2,
  },

  // Search
  searchContainer: {
    height: 45,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    marginBottom: 14,
  },

  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#172554',
    marginLeft: 9,
    paddingVertical: 0,
  },

  // User list
  listHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },

  listHeadingText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#64748B',
  },

  totalUsers: {
    fontSize: 10,
    color: '#94A3B8',
  },

  listContent: {
    paddingBottom: 8,
    flexGrow: 1,
  },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 11,
    marginBottom: 9,
  },

  selectedUserCard: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },

  avatar: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2563EB',
  },

  userInfo: {
    flex: 1,
  },

  userName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#172554',
  },

  userEmail: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 4,
  },

  checkbox: {
    width: 23,
    height: 23,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },

  checkboxSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },

  checkmark: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  // Loading and empty states
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 12,
  },

  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 35,
  },

  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#172554',
  },

  emptySubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 7,
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  // Bottom action
  bottomContainer: {
    paddingTop: 10,
    paddingBottom: 5,
    backgroundColor: '#F8FAFC',
  },

  createButton: {
    height: 51,
    flexDirection: 'row',
    gap: 9,
    backgroundColor: '#2563EB',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },

  disabledButton: {
    opacity: 0.6,
  },

  createButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  bottomHint: {
    textAlign: 'center',
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 8,
  },
});
