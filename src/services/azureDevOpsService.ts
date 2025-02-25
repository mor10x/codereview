import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

// Azure DevOps API configuration
const pat = process.env.AZURE_DEVOPS_PAT;
const organization = process.env.AZURE_DEVOPS_ORGANIZATION;
const project = process.env.AZURE_DEVOPS_PROJECT;
const apiVersion = '7.0';

// Properly encode the organization and project for the URL
const encodedOrg = encodeURIComponent(organization || '');
const encodedProject = encodeURIComponent(project || '');
const baseUrl = `https://dev.azure.com/${encodedOrg}/${encodedProject}`;

// Create authorization header with Personal Access Token
const authHeader = {
  headers: {
    'Authorization': `Basic ${Buffer.from(`:${pat}`).toString('base64')}`,
    'Content-Type': 'application/json'
  }
};

// Text content header for getting raw file content
const textContentHeader = {
  headers: {
    'Authorization': `Basic ${Buffer.from(`:${pat}`).toString('base64')}`,
    'Accept': 'text/plain',
    'Content-Type': 'text/plain'
  }
};

// Define interfaces for Azure DevOps API responses
interface ChangeItem {
  path: string;
  contentMetadata?: {
    fileName?: string;
    extension?: string;
  };
  [key: string]: any;
}

interface Change {
  item: ChangeItem;
  changeType: string;
  [key: string]: any;
}

interface FileMetadata {
  objectId: string;
  gitObjectType: string;
  commitId: string;
  path: string;
  url: string;
  _links: {
    blob?: {
      href: string;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Format branch name for API requests by removing refs/heads/ prefix if present
 */
function formatBranchName(branchName: string): string {
  // If the branch name starts with 'refs/heads/', remove it
  return branchName.replace(/^refs\/heads\//, '');
}

/**
 * Get pull request comments
 */
export async function getPullRequestComments(
  pullRequestId: number,
  repositoryId: string,
  projectId: string
): Promise<any[]> {
  try {
    console.log(`Getting comments for PR #${pullRequestId} in repository ${repositoryId}`);

    // Use the correct URL format for pull request threads
    const url = `${baseUrl}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/threads?api-version=${apiVersion}`;
    console.log(`Request URL: ${url}`);

    const response = await axios.get(url, authHeader);
    return response.data.value || [];
  } catch (error) {
    console.error('Error getting pull request comments');
    throw error;
  }
}

/**
 * Get the raw content of a file using its path and branch
 */
async function getFileContent(repositoryId: string, filePath: string, branchName: string): Promise<string | null> {
  try {
    // Use the download endpoint to get the raw file content directly
    const downloadUrl = `${baseUrl}/_apis/git/repositories/${repositoryId}/items?path=${encodeURIComponent(filePath)}&version=${encodeURIComponent(branchName)}&includeContent=true&api-version=${apiVersion}`;
    console.log(`Download URL: ${downloadUrl}`);

    const response = await axios.get(downloadUrl, {
      ...textContentHeader,
      responseType: 'text'
    });

    if (typeof response.data === 'string') {
      return response.data;
    } else if (response.data && typeof response.data === 'object') {
      console.log('Received object instead of string content, attempting to extract content');
      // If we got an object, try to extract the content from it
      return JSON.stringify(response.data);
    }

    console.error('Unexpected response format from download endpoint');
    return null;
  } catch (error) {
    console.error(`Error downloading file content for ${filePath}:`);
    return null;
  }
}

/**
 * Get pull request details including changes
 */
export async function getPullRequestDetails(
  pullRequestId: number,
  repositoryId: string,
  projectId: string
): Promise<any> {
  try {
    console.log(`Getting details for PR #${pullRequestId} in repository ${repositoryId}`);

    // Get basic pull request info
    const prUrl = `${baseUrl}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}?api-version=${apiVersion}`;
    console.log(`PR URL: ${prUrl}`);
    const prResponse = await axios.get(prUrl, authHeader);

    // Get the source and target branches from the PR and format them correctly
    const sourceBranchRaw = prResponse.data.sourceRefName;
    const targetBranchRaw = prResponse.data.targetRefName;

    const sourceBranch = formatBranchName(sourceBranchRaw);
    const targetBranch = formatBranchName(targetBranchRaw);

    console.log(`Source branch (raw): ${sourceBranchRaw}`);
    console.log(`Target branch (raw): ${targetBranchRaw}`);
    console.log(`Source branch (formatted): ${sourceBranch}`);
    console.log(`Target branch (formatted): ${targetBranch}`);

    // Get the list of files changed in the pull request
    const commitUrl = `${baseUrl}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/commits?api-version=${apiVersion}`;
    console.log(`Commits URL: ${commitUrl}`);
    const commitsResponse = await axios.get(commitUrl, authHeader);

    // Get the list of files changed across all commits
    const commits = commitsResponse.data.value || [];
    console.log(`Found ${commits.length} commits in the pull request`);
    let changedFiles: Change[] = [];

    for (const commit of commits) {
      try {
        const commitChangesUrl = `${baseUrl}/_apis/git/repositories/${repositoryId}/commits/${commit.commitId}/changes?api-version=${apiVersion}`;
        const commitChangesResponse = await axios.get(commitChangesUrl, authHeader);
        const commitChanges = commitChangesResponse.data.changes || [];

        // Add unique changes to our list
        for (const change of commitChanges) {
          if (!changedFiles.some(c => c.item.path === change.item.path)) {
            changedFiles.push(change);
          }
        }
      } catch (error) {
        console.error(`Error getting changes for commit ${commit.commitId}:`);
      }
    }

    console.log(`Found ${changedFiles.length} changed files from commits`);

    // Get the content of each changed file
    const filesWithContent = await Promise.all(
      changedFiles.map(async (change: Change) => {
        if (change.item && change.item.path && change.item?.isFolder !== true) {
          console.log(`Getting content for file ${change.item.path}`);

          // Get the file content directly using the download endpoint
          const content = await getFileContent(repositoryId, change.item.path, sourceBranch);

          if (content) {
            return {
              path: change.item.path,
              content: content,
              changeType: change.changeType
            };
          } else {
            console.error(`Failed to get content for file ${change.item.path}`);
            return {
              path: change.item.path,
              content: null,
              changeType: change.changeType,
              error: 'Failed to retrieve content'
            };
          }
        }
        return null;
      })
    );

    const result = {
      pullRequest: prResponse.data,
      changes: filesWithContent.filter(Boolean)
    };

    // Return combined data
    return result;
  } catch (error) {
    console.error('Error getting pull request details');
    throw error;
  }
}

/**
 * Add a comment to a pull request
 */
export async function addCommentToPullRequest(
  pullRequestId: number,
  repositoryId: string,
  projectId: string,
  commentContent: string
): Promise<void> {
  try {
    const url = `${baseUrl}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/threads?api-version=${apiVersion}`;
    console.log(`Adding comment to PR #${pullRequestId}, URL: ${url}`);

    // Create a new thread with the comment
    const threadData = {
      comments: [
        {
          content: commentContent,
          commentType: "text" // Use "text" for normal comment
        }
      ],
      status: 1 // 1 = active
    };

    await axios.post(url, threadData, authHeader);
    console.log('Comment added successfully to pull request');
  } catch (error) {
    console.error('Error adding comment to pull request:', error);
    throw error;
  }
}
