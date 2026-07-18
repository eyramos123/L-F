# Lost & Found Management System

A production-ready, fully responsive serverless web application for reporting, searching, and managing lost and found items.

## Technology Stack
- **Frontend:** HTML5, CSS3, JavaScript (ES6 Modules), Bootstrap 5 (with native light/dark themes, icons, and modern custom animations).
- **Backend:** Firebase Services:
  - **Firebase Authentication:** Handles secure user logins restricted to Google Authentication.
  - **Cloud Firestore:** A fast, schema-free database for reports, users, messages, activity logs, and notifications.
  - **Firebase Storage:** Stores uploaded images for lost and found reports.
  - **Firebase Hosting:** Fast and secure hosting for client files.

---

## Folder Structure
```text
/
├── css/
│   └── styles.css          # Core styles, animations, variables, dark mode styles
├── js/
│   ├── firebase.js         # Firebase initializers and imports wrapper
│   ├── auth.js             # Session controls, Google sign-in/out, role routing
│   ├── utils.js            # Toast alerts, loader spinners, headers, footers
│   ├── search.js           # Advanced multi-parameter search & live suggestions
│   ├── reports.js          # File previews, media uploads, detail page loading
│   ├── dashboard.js        # User's items view, edit, solve actions
│   └── admin.js            # System metrics charts, report approvals, user management
├── index.html              # Main homepage
├── login.html              # User login screen
├── dashboard.html          # Customer workspace dashboard
├── report-lost.html        # Form to report a lost item
├── report-found.html       # Form to report a found item
├── report-details.html     # Dedicated page for viewing a single report
├── profile.html            # User profile viewer & settings
├── admin.html              # Administrator dashboard
├── firestore.rules         # Cloud Firestore security access controls
└── storage.rules           # Cloud Storage security access rules
```

---

## Firebase Setup Instructions

### 1. Create a Firebase Project
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** and follow the prompts to name and create your project.

### 2. Set Up Firebase Authentication
1. Navigate to **Authentication** in the left menu, then click **Get Started**.
2. Go to the **Sign-in method** tab.
3. Select **Google** from the list of provider options, toggle **Enable**, and set your support email.
4. Under the Google settings page, ensure your development domain (`localhost` or `127.0.0.1`) and production domain are in the **Authorized domains** list.

### 3. Set Up Cloud Firestore
1. Navigate to **Firestore Database** in the left menu, then click **Create database**.
2. Select **Start in test mode** (we will deploy strict rules later).
3. Select your database location and click **Enable**.

### 4. Set Up Cloud Storage
1. Navigate to **Storage** in the left menu, then click **Get Started**.
2. Click **Next** to proceed with the default rules and locations, then click **Done**.

### 5. Add Web App to Firebase
1. On the project homepage in Firebase Console, click the **Web icon** (looks like `</>`) to add an app.
2. Register the app with a nickname (e.g., `Lost and Found`).
3. Copy the `firebaseConfig` object from the setup code snippet. It will look like this:
   ```javascript
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_PROJECT_ID.appspot.com",
     messagingSenderId: "YOUR_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```
4. Paste this config object inside `js/firebase.js`.

---

## Database Initialization & Setting the First Admin

1. Once a user signs in for the first time, their account document is automatically created in the `/users` collection with the role `customer` and status `active`.
2. To designate the first **Admin**:
   - Locate the user's document inside the `/users` collection in the Firestore Console (look for their Gmail address or UID).
   - Edit the `role` field on that document from `"customer"` to `"admin"`.
   - The user will immediately be granted access to the Admin Dashboard upon their next reload/navigation.

---

## Security Rules Deployment

To secure your backend against malicious actions:

### Firestore Rules
Copy the content of `firestore.rules` and paste it into the **Rules** tab of your Firestore Database in the Firebase Console, then click **Publish**.

### Storage Rules
Copy the content of `storage.rules` and paste it into the **Rules** tab of Cloud Storage in the Firebase Console, then click **Publish**.

---

## Local Development & Deployment

### 1. Local Testing
You can run this application locally using a simple HTTP server. Since we are using ES6 modules, the file system cannot be read via `file://` protocols directly due to CORS restrictions.
Use an extension like VS Code's **Live Server**, or run a terminal command:
```bash
npx serve .
# or
python -m http.server 8000
```
Then navigate to `http://localhost:5000` (or the printed port) in your web browser.

### 2. Deploying to Firebase Hosting
1. Install the Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```
2. Log in to your Firebase account:
   ```bash
   firebase login
   ```
3. Initialize hosting in your project root:
   ```bash
   firebase init hosting
   ```
   - Select your existing project.
   - Choose the current directory (`.`) or configure the build directory as the root (since files are located directly at the root).
   - Configure as a single-page app: **No** (we have multiple HTML pages).
   - File overwrite prompts: **No** (do not overwrite existing `index.html`).
4. Deploy the application:
   ```bash
   firebase deploy
   ```
