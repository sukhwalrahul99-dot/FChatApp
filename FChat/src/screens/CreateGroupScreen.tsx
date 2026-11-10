
import React, {useEffect, useState} from 'react';

import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  collection,
  onSnapshot,
} from '@react-native-firebase/firestore';

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

  // Select / Unselect member
  const toggleMember = (uid: string) => {
    setSelectedMembers(previous => {
      if (previous.includes(uid)) {
        return previous.filter(id => id !== uid);
      }

      return [...previous, uid];
    });
  };

  // Create Group
  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert(
        'Validation',
        'Please enter group name.',
      );
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
        'Group created successfully.',
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

  // Render User
  const renderUser = ({item}: {item: UserProfile}) => {
    const selected = selectedMembers.includes(item.uid);

    return (
      <TouchableOpacity
        style={[
          styles.userCard,
          selected && styles.selectedUserCard,
        ]}
        activeOpacity={0.75}
        onPress={() => toggleMember(item.uid)}>

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.name?.trim()?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </View>

        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {item.name || 'User'}
          </Text>

          <Text style={styles.userEmail} numberOfLines={1}>
            {item.email}
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
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            disabled={creating}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>

          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>
              Create Group
            </Text>

            <Text style={styles.headerSubtitle}>
              Add members to your group
            </Text>
          </View>
        </View>

        <View style={styles.content}>

          {/* Group Name */}
          <View style={styles.inputCard}>
            <Text style={styles.label}>
              GROUP NAME
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
          </View>

          {/* Member Header */}
          <View style={styles.memberHeader}>
            <View>
              <Text style={styles.sectionTitle}>
                Select Members
              </Text>

              <Text style={styles.sectionSubtitle}>
                Choose at least 2 members
              </Text>
            </View>

            <View style={styles.selectedBadge}>
              <Text style={styles.selectedBadgeText}>
                {selectedMembers.length} Selected
              </Text>
            </View>
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
              data={users}
              keyExtractor={item => item.uid}
              renderItem={renderUser}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyTitle}>
                    No Users Found
                  </Text>

                  <Text style={styles.emptySubtitle}>
                    Register more users to create a group.
                  </Text>
                </View>
              }
            />
          )}

          {/* Create Button */}
          <TouchableOpacity
            style={[
              styles.createButton,
              creating && styles.disabledButton,
            ]}
            activeOpacity={0.8}
            disabled={creating}
            onPress={handleCreateGroup}>

            {creating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.createButtonText}>
                Create Group
              </Text>
            )}
          </TouchableOpacity>

        </View>
      </View>
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    elevation: 3,
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },

  backText: {
    fontSize: 32,
    lineHeight: 36,
    color: '#2563EB',
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

  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 15,
  },

  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 24,
  },

  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#64748B',
    marginBottom: 10,
  },

  input: {
    height: 46,
    borderRadius: 11,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 13,
    color: '#172554',
    fontSize: 14,
  },

  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#172554',
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

  listContent: {
    paddingBottom: 12,
  },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },

  selectedUserCard: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },

  avatar: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  avatarText: {
    fontSize: 19,
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
    fontSize: 11,
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

  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#172554',
  },

  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 7,
  },

  createButton: {
    height: 52,
    backgroundColor: '#2563EB',
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
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
});
