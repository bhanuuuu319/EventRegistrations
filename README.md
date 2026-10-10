# EventRegister

Campus event platform: HTML, CSS, Bootstrap 5, vanilla JS (ES modules), Firebase Auth, Cloud Firestore and Security Rules.
No Cloud Functions or paid plan is needed. Everything runs on the free Spark plan.

## 1. Folder structure
```
EventRegister/
  index.html  login.html  register.html  events.html  my-registrations.html
  student-dashboard.html  admin-dashboard.html
  css/style.css
  js/ firebase-config.js auth.js guards.js utils.js catalog.js layout.js service.js
      home.js login.js register.js events.js registrations.js student-dashboard.js admin-dashboard.js
  firestore.rules  firestore.indexes.json  firebase.json
  admin-tools/set-admin.js   (optional, run on your computer only)
```
Unzip the project, then in VS Code use File > Open Folder > EventRegister.

## 2. Firebase setup (project eventregistration-2b0a2)
1. Open https://console.firebase.google.com and select **eventregistration-2b0a2**.
2. **Build > Authentication > Get started > Sign-in method > Email/Password > Enable > Save.**
3. **Build > Firestore Database > Create database** (production mode, choose a nearby region such as asia-south1).
4. The web config is already in `js/firebase-config.js` (Project settings > Your apps > Web app, if you ever need to re-copy it).
5. **Firestore > Rules tab:** replace everything with the contents of `firestore.rules`, then **Publish**.
6. **Indexes** (Firestore > Indexes > Composite): create the ones listed in `firestore.indexes.json`, or deploy them with the CLI (section 8).
   If you skip this, the browser console prints a "query requires an index" error with a one-click link. Click it and wait about a minute.

## 3. Run locally
1. In VS Code install the **Live Server** extension. Right-click `index.html` > **Open with Live Server** (http://127.0.0.1:5500).
2. Or from a terminal in the project folder: `python -m http.server 5500` and open http://localhost:5500.
3. Do not double-click the HTML files (`file://`). Browsers block ES modules and Firebase Auth on `file://`, so the pages show blank or "CORS" errors.
4. If Firebase says the domain is not authorized: Authentication > Settings > Authorized domains > add `localhost` and `127.0.0.1`.

## 4. Create the first student, then the first admin
1. Open `register.html` and create a student account.
2. **Admin, Option A (Firebase Console):**
   - Authentication > Users > copy the **User UID** of that account.
   - Firestore > `users` > document with that UID > edit field `role`: change `student` to `admin` > Update.
   - Console writes bypass the rules. Browser code can never do this: the rules only allow students to edit fullName, department and year.
3. **Admin, Option B (Admin SDK on your computer):**
   `cd admin-tools`, `npm i firebase-admin`, put your service-account key there as `serviceAccountKey.json`, then `node set-admin.js <UID>`.
   Never upload the key or this script to Hosting or Git.
4. Log out and in again. Admins go to `admin-dashboard.html`.
5. Custom claims also work, but then the rules' `isAdmin()` and the JS role checks must be changed together. This project uses the `users/{uid}.role` document consistently.
6. There is no default admin, no admin sign-up and no role selector anywhere.

## 5. How it works
- **Sign-up:** Auth account is created (Firebase guarantees unique email). A single Firestore transaction then writes `usernames/{name}` and `users/{uid}` together.
  The rules reject the username write if the document exists, and reject either write unless the other is in the same commit. Two people racing for one username: one wins, the other gets "Username already exists".
- **Incomplete registrations:** if the transaction fails, the app deletes the new Auth user. If that delete also fails (network drop), delete the user in Authentication > Users and register again. Login shows "account has no profile" for such users.
- **Seats:** `eventStats/{eventId}.registeredCount`. A student can only change it by exactly +1 or -1 in the same commit as their own registration write, never above `capacity`, never after the deadline.
  Registration ID is `uid_eventId`, so a student can't hold two registrations for one event.
- **Roles:** only admins can create/edit/delete events or read other users, registrations and login activity.
- **Login activity:** written after a successful login (and on the Logout button), append-only. Closing a tab records no logout.

## 6. Test checklist
| # | Test | Expect |
|---|------|--------|
| 1 | Register a new student | Lands on student dashboard; docs appear in `users` and `usernames` |
| 2 | Register again with same email | "Email already exists. Please log in or reset your password." |
| 3 | Register with username `Priya_K` after `priya_k` exists | "Username already exists..." and no leftover Auth user |
| 4 | Bad email / weak password | Inline errors; strength bar updates live |
| 5 | Wrong password at login | "Incorrect email or password." |
| 6 | Student opens `admin-dashboard.html` | Redirected to student dashboard; Firestore requests for other users are denied |
| 7 | In browser console try to set own `role` to admin | `permission-denied` |
| 8 | Admin creates a published Sports > Cricket event (capacity 2) | Appears in Explore Events |
| 9 | Student clicks Sports | Chips: Cricket, Volleyball, Badminton, Football, Basketball, Table Tennis, Chess, Kabaddi |
| 10 | Register > confirm | Success with reference; shows in My Registrations and dashboard |
| 11 | Register again | Shows "You are registered" (duplicates blocked by ID and rules) |
| 12 | Two other students register | Third attempt: "Sorry, this event is full." |
| 13 | Cancel a registration | Seat returns; status Cancelled tab |
| 14 | Admin: edit event, search students, export CSV, view login activity | All work; `updatedAt` changes on edit |
| 15 | Resize to phone width | Navbar collapses; cards stack |

## 7. Troubleshooting
- **auth/email-already-in-use:** the email has an account. Log in or use Forgot password.
- **permission-denied:** rules not published, user not signed in, a student touching admin data, or you are querying drafts as a student. Re-publish `firestore.rules`.
  If sign-up shows it, check Authentication is enabled and the rules were pasted completely.
- **auth/invalid-credential:** wrong email or password (Firebase no longer says which).
- **"The query requires an index":** open the link in the console error, or create the indexes from `firestore.indexes.json`.
- **Blank page / module errors:** you opened the file with `file://`. Use Live Server.
- **Admin sees "Could not load admin data":** the user doc must have `role: "admin"` and `status: "active"`.

## 8. Deploy with Firebase Hosting
```
npm install -g firebase-tools
firebase login
firebase use eventregistration-2b0a2
firebase deploy --only firestore:rules,firestore:indexes,hosting
```
(Run inside the project folder. If asked during `firebase init`, keep the existing `firebase.json`.) Your site will be at https://eventregistration-2b0a2.web.app.

## 9. Known limits (honest notes)
- **Deactivating a student** sets `status: "disabled"`: the app signs them out at login, and rules stop them registering. It cannot disable the Firebase Auth account itself.
  To block sign-in at the Auth level, use the Admin SDK (`admin.auth().updateUser(uid, {disabled:true})`) or the Console.
- **Deadline checks** use end of day IST, enforced in rules against the event's `registrationDeadlineAt` timestamp.
- **Notifications** on the dashboard are derived from the student's own registrations; there is no push/email service. That would need Cloud Functions (Blaze plan).
- The Firebase web config is public by design. Security comes from the rules, not from hiding that config.
- Username availability is confirmed at sign-up time (inside the transaction), not while typing, because the rules do not let signed-out visitors read `usernames`.
- Event banners come from category gradients or an admin-supplied https image URL. There is no file upload (Storage is not used).
