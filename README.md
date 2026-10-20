Git_Leet_Git

Chrome extension that automatically pushes every **Accepted** LeetCode submission to a GitHub repository:
- **Commit 1:** The accepted solution code (e.g. `0001-two-sum/solution.py`)
- **Commit 2:** Performance metrics (runtime, memory, percentiles) appended to a per-problem `stats.md`

---

## Installation & Setup

### 1. Prepare your GitHub Repository
1. Create a repository on GitHub (e.g. `youruser/leetcode-solutions`).
2. **Important:** Ensure the repository has at least 1 commit (check the option to *"Add a README file"* when creating the repository).

### 2. Generate a Fine-Grained GitHub Token
1. Go to GitHub: **Settings > Developer Settings > Personal access tokens > Fine-grained tokens**.
2. Click **Generate new token**.
3. Choose repository access: **Only select repositories** and pick your LeetCode repository.
4. Under **Permissions > Repository permissions**:
   - Set **Contents** to **Read and write**.
   - (Metadata automatically becomes Read-only).
5. Click **Generate token** and copy it (`github_pat_...`).

### 3. Load Extension in Chrome
1. In Google Chrome, navigate to `chrome://extensions`.
2. Toggle on **Developer mode** in the top right corner.
3. Click **Load unpacked** in the top left corner.
4. Select this directory (`Git_Leet_Git`).
5. (If already installed previously, click the **Reload** 🔄 button on the LC Sync card).

### 4. Configure Extension Settings
1. Click the **LC Sync** icon in your browser toolbar (or open extension Options).
2. Enter:
   - **GitHub Personal Access Token:** your `github_pat_...`
   - **GitHub Repository:** `yourusername/your-repo`
   - **Branch:** `main` (or `master`)
   - **Folder prefix:** *(Optional)* e.g. `solutions`
3. Click **Test Connection** to verify permissions and branch existence.
4. Click **Save Settings**.

---

## How It Works

1. **Page Hook (`src/content/page-hook.js`):** Injected at `document_start` into the page context. Intercepts LeetCode judge evaluation responses (`/submissions/detail/<id>/check/`, GraphQL, and DOM) and detects when a submission receives the `Accepted` verdict.
2. **Bridge (`src/content/bridge.js`):** Receives the accepted submission ID and queries LeetCode's GraphQL API (`submissionDetails`) with session credentials to retrieve the full code, language, runtime, memory, and question metadata.
3. **Queue & Background Worker (`src/background/`):** A durable queue worker commits the solution file first, then appends the stats to `stats.md`, updating your repository automatically.

---

## Troubleshooting

- **Check Browser Console:** Open Developer Tools (`F12`) on LeetCode and inspect the Console tab. You should see logs prefixed with `[LC Sync]`.
- **Options Status:** Open the LC Sync options page to check the queue status or view any recent error message. You can click **Retry Failed Syncs** to re-process pending items.
- **Empty Repository Error:** GitHub requires at least 1 commit before the Git Data API can branch or add trees. If your repo is brand new, add a `README.md` first.
