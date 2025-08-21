/**
 * User Management System
 * Handles user registration, authentication, and profile management
 */

class User {
    constructor(id, username, email, password) {
        this.id = id;
        this.username = username;
        this.email = email;
        this.password = password; // In real app, this would be hashed
        this.createdAt = new Date();
        this.lastLogin = null;
        this.isActive = true;
    }

    updateProfile(updates) {
        if (updates.username) this.username = updates.username;
        if (updates.email) this.email = updates.email;
        if (updates.password) this.password = updates.password;
    }

    login() {
        this.lastLogin = new Date();
        return true;
    }

    logout() {
        // Clear session data
        return true;
    }
}

class UserManager {
    constructor() {
        this.users = new Map();
        this.nextId = 1;
    }

    registerUser(username, email, password) {
        // Check if user already exists
        for (const user of this.users.values()) {
            if (user.username === username || user.email === email) {
                throw new Error('User already exists');
            }
        }

        const user = new User(this.nextId++, username, email, password);
        this.users.set(user.id, user);
        return user;
    }

    authenticateUser(username, password) {
        for (const user of this.users.values()) {
            if (user.username === username && user.password === password) {
                user.login();
                return user;
            }
        }
        return null;
    }

    getUserById(id) {
        return this.users.get(id);
    }

    updateUser(id, updates) {
        const user = this.users.get(id);
        if (!user) {
            throw new Error('User not found');
        }
        user.updateProfile(updates);
        return user;
    }

    deleteUser(id) {
        const user = this.users.get(id);
        if (!user) {
            throw new Error('User not found');
        }
        user.isActive = false;
        return true;
    }

    getAllUsers() {
        return Array.from(this.users.values()).filter(user => user.isActive);
    }

    searchUsers(query) {
        const results = [];
        const lowerQuery = query.toLowerCase();
        
        for (const user of this.users.values()) {
            if (user.isActive && 
                (user.username.toLowerCase().includes(lowerQuery) ||
                 user.email.toLowerCase().includes(lowerQuery))) {
                results.push(user);
            }
        }
        return results;
    }
}

// Example usage
const userManager = new UserManager();

// Register some users
try {
    userManager.registerUser('john_doe', 'john@example.com', 'password123');
    userManager.registerUser('jane_smith', 'jane@example.com', 'secure456');
    userManager.registerUser('admin', 'admin@company.com', 'adminpass');
} catch (error) {
    console.error('Registration error:', error.message);
}

// Authenticate user
const authenticatedUser = userManager.authenticateUser('john_doe', 'password123');
if (authenticatedUser) {
    console.log('User authenticated:', authenticatedUser.username);
}

// Search users
const searchResults = userManager.searchUsers('john');
console.log('Search results:', searchResults.map(u => u.username));

module.exports = { User, UserManager };
