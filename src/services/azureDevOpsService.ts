import axios from 'axios';
import * as dotenv from 'dotenv';
import * as azdev from 'azure-devops-node-api';
import * as GitInterfaces from 'azure-devops-node-api/interfaces/GitInterfaces';
import { IGitApi } from 'azure-devops-node-api/GitApi';
import { PagedList } from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import * as path from 'path';

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

/**
 * Mapping of file extensions to programming languages
 */
const LANGUAGE_EXTENSIONS: Record<string, string> = {
  // JavaScript and TypeScript
  '.js': 'JavaScript',
  '.jsx': 'JavaScript (React)',
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript (React)',

  // Web
  '.html': 'HTML',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.sass': 'Sass',
  '.less': 'Less',

  // C-family
  '.c': 'C',
  '.cpp': 'C++',
  '.h': 'C/C++ Header',
  '.hpp': 'C++ Header',
  '.cs': 'C#',

  // Java
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.groovy': 'Groovy',

  // Python
  '.py': 'Python',
  '.ipynb': 'Jupyter Notebook',

  // Ruby
  '.rb': 'Ruby',
  '.erb': 'Ruby (ERB)',

  // PHP
  '.php': 'PHP',

  // Go
  '.go': 'Go',

  // Rust
  '.rs': 'Rust',

  // Swift
  '.swift': 'Swift',

  // Shell scripts
  '.sh': 'Shell',
  '.bash': 'Bash',
  '.zsh': 'Zsh',
  '.ps1': 'PowerShell',
  '.bat': 'Batch',
  '.cmd': 'Batch',

  // Configuration
  '.json': 'JSON',
  '.xml': 'XML',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.toml': 'TOML',
  '.ini': 'INI',
  '.conf': 'Configuration',

  // Markdown and documentation
  '.md': 'Markdown',
  '.markdown': 'Markdown',
  '.rst': 'reStructuredText',

  // Database
  '.sql': 'SQL',

  // Other
  '.r': 'R',
  '.dart': 'Dart',
  '.fs': 'F#',
  '.elm': 'Elm',
  '.clj': 'Clojure',
  '.ex': 'Elixir',
  '.exs': 'Elixir',
  '.erl': 'Erlang',
  '.hs': 'Haskell',
  '.lua': 'Lua',
  '.pl': 'Perl',
  '.pm': 'Perl',
  '.scala': 'Scala',
  '.vb': 'Visual Basic',
};

/**
 * Determine if a file is a programming file based on its extension
 * @param filePath The path of the file to check
 * @returns Object with language name and whether it's a programming file
 */
export function identifyFileLanguage(filePath: string): { language: string | null; isProgrammingFile: boolean } {
  if (!filePath) {
    return { language: null, isProgrammingFile: false };
  }

  // Get the file extension (lowercase)
  const extension = path.extname(filePath).toLowerCase();

  // Check if the extension is in our mapping
  if (extension in LANGUAGE_EXTENSIONS) {
    return {
      language: LANGUAGE_EXTENSIONS[extension],
      isProgrammingFile: true
    };
  }

  return { language: null, isProgrammingFile: false };
}

/**
 * Get the Azure DevOps Git API client
 * @returns Promise with the Git API client
 */
async function getGitApi(): Promise<IGitApi> {
  try {
    const orgUrl = `https://dev.azure.com/${organization}`;
    const authHandler = azdev.getPersonalAccessTokenHandler(pat || '');
    const connection = new azdev.WebApi(orgUrl, authHandler);

    return await connection.getGitApi();
  } catch (error) {
    console.error('Error getting Git API client:', error);
    throw error;
  }
}

/**
 * Format branch name for API requests by removing refs/heads/ prefix if present
 */
function formatBranchName(branchName: string): string {
  // If the branch name starts with 'refs/heads/', remove it
  return branchName.replace(/^refs\/heads\//, '');
}

/**
 * Get a pull request by ID using the azure-devops-node-api library
 * @param pullRequestId The ID of the pull request to retrieve
 * @param repositoryId Optional repository ID. If not provided, will use getPullRequestById which doesn't require repository ID
 * @returns Promise with the pull request details
 */
export async function getPullRequest(pullRequestId: number, repositoryId?: string): Promise<GitInterfaces.GitPullRequest> {
  try {
    // Get the Git API client
    const gitApi = await getGitApi();

    // Get the pull request
    if (repositoryId) {
      // If repository ID is provided, use getPullRequest
      return await gitApi.getPullRequest(
        repositoryId,
        pullRequestId,
        project,
        undefined, // maxCommentLength
        undefined, // skip
        undefined, // top
        true,      // includeCommits
        true       // includeWorkItemRefs
      );
    } else {
      // If no repository ID is provided, use getPullRequestById
      return await gitApi.getPullRequestById(pullRequestId, project);
    }
  } catch (error) {
    console.error(`Error getting pull request ${pullRequestId}:`, error);
    throw error;
  }
}

/**
 * Get all commits from a pull request
 * @param pullRequest The pull request object
 * @returns Promise with an array of commit references
 */
export async function getPullRequestCommits(pullRequest: GitInterfaces.GitPullRequest): Promise<GitInterfaces.GitCommitRef[]> {
  try {
    // Ensure the pull request has a repository and ID
    if (!pullRequest.repository || !pullRequest.repository.id) {
      throw new Error('Pull request does not have a valid repository');
    }

    if (!pullRequest.pullRequestId) {
      throw new Error('Pull request does not have a valid ID');
    }

    // Get the Git API client
    const gitApi = await getGitApi();

    // Extract repository ID and pull request ID from the pull request object
    const repositoryId = pullRequest.repository.id;
    const pullRequestId = pullRequest.pullRequestId;

    // Get all commits from the pull request
    const commits: PagedList<GitInterfaces.GitCommitRef> = await gitApi.getPullRequestCommits(
      repositoryId,
      pullRequestId,
      project || ''
    );

    return commits;
  } catch (error) {
    console.error(`Error getting commits for pull request ${pullRequest.pullRequestId}:`, error);
    throw error;
  }
}

/**
 * Represents a file change in a pull request
 */
export interface FileChange {
  /** The path of the file that was changed */
  fileName: string;
  /** The content of the file changes */
  changeContent: string;
  /** The change type (add, edit, delete) */
  changeType: GitInterfaces.VersionControlChangeType;
  /** Original file path (for renames) */
  originalPath?: string;
  /** The identified programming language */
  language?: string;
}

/**
 * Get all file changes from a pull request
 * @param pullRequest The pull request object
 * @param programmingFilesOnly Whether to include only programming files (default: false)
 * @returns Promise with an array of file changes
 */
export async function getPullRequestChanges(
  pullRequest: GitInterfaces.GitPullRequest
): Promise<FileChange[]> {
  try {
    // Ensure the pull request has a repository and ID
    if (!pullRequest.repository || !pullRequest.repository.id) {
      throw new Error('Pull request does not have a valid repository');
    }

    if (!pullRequest.pullRequestId) {
      throw new Error('Pull request does not have a valid ID');
    }

    // Get the Git API client
    const gitApi = await getGitApi();

    // Extract repository ID and pull request ID from the pull request object
    const repositoryId = pullRequest.repository.id;
    const pullRequestId = pullRequest.pullRequestId;

    // Get the latest iteration
    const iterations = await gitApi.getPullRequestIterations(
      repositoryId,
      pullRequestId,
      project || ''
    );

    if (!iterations || iterations.length === 0) {
      throw new Error('No iterations found for the pull request');
    }

    // Get the latest iteration
    const latestIteration = iterations[iterations.length - 1];
    const iterationId = latestIteration.id;

    if (!iterationId) {
      throw new Error('Latest iteration does not have a valid ID');
    }

    // Get changes for the latest iteration
    const changes = await gitApi.getPullRequestIterationChanges(
      repositoryId,
      pullRequestId,
      iterationId,
      project || ''
    );

    if (!changes || !changes.changeEntries) {
      return [];
    }

    // Process each change entry to get file content
    const fileChanges: FileChange[] = [];

    for (const change of changes.changeEntries) {
      if (!change.item || !change.item.path) {
        continue;
      }

      // Check if the file is a programming file
      const { language, isProgrammingFile } = identifyFileLanguage(change.item.path);

      // Skip if we only want programming files and this isn't one
      if (!isProgrammingFile) {
        continue;
      }

      try {
        let changeContent = '';

        // Skip binary files or files that were deleted
        if (change.changeType !== GitInterfaces.VersionControlChangeType.Delete) {
          // Get the file content for the current version
          const blobContent = await gitApi.getBlobContent(
            repositoryId,
            change.item.objectId || '',
            project || '',
            true // download
          );

          // Convert the blob to text
          if (blobContent) {
            // Read the stream to get the content
            const chunks: Buffer[] = [];
            for await (const chunk of blobContent) {
              chunks.push(Buffer.from(chunk));
            }
            changeContent = Buffer.concat(chunks).toString('utf8');
          }
        }

        fileChanges.push({
          fileName: change.item.path,
          changeContent,
          changeType: change.changeType || GitInterfaces.VersionControlChangeType.None,
          originalPath: change.sourceServerItem,
          language: language || undefined
        });
      } catch (error) {
        console.error(`Error getting content for file ${change.item.path}:`, error);
        // Continue with other files even if one fails
      }
    }

    return fileChanges;
  } catch (error) {
    console.error(`Error getting changes for pull request ${pullRequest.pullRequestId}:`, error);
    throw error;
  }
}

/**
 * Represents a comment on a pull request
 */
export interface PullRequestComment {
  /** The comment ID */
  id: number;
  /** The content of the comment */
  content: string;
  /** The author of the comment */
  author: string;
  /** The date the comment was created */
  createdDate: Date;
  /** The date the comment was last updated */
  lastUpdatedDate: Date;
  /** The status of the comment (active, fixed, etc.) */
  status?: string;
  /** The file path the comment is associated with, if any */
  filePath?: string;
  /** The thread ID the comment belongs to */
  threadId: number;
  /** The parent comment ID, if this is a reply */
  parentCommentId?: number;
}

/**
 * Get all non-system comments from a pull request
 * @param pullRequest The pull request object
 * @returns Promise with an array of pull request comments
 */
export async function getPullRequestComments(pullRequest: GitInterfaces.GitPullRequest): Promise<PullRequestComment[]> {
  try {
    // Ensure the pull request has a repository and ID
    if (!pullRequest.repository || !pullRequest.repository.id) {
      throw new Error('Pull request does not have a valid repository');
    }

    if (!pullRequest.pullRequestId) {
      throw new Error('Pull request does not have a valid ID');
    }

    // Get the Git API client
    const gitApi = await getGitApi();

    // Extract repository ID and pull request ID from the pull request object
    const repositoryId = pullRequest.repository.id;
    const pullRequestId = pullRequest.pullRequestId;

    // Get all threads from the pull request
    const threads = await gitApi.getThreads(
      repositoryId,
      pullRequestId,
      project || ''
    );

    if (!threads || threads.length === 0) {
      return [];
    }

    // Process each thread to extract comments
    const comments: PullRequestComment[] = [];

    for (const thread of threads) {
      // Skip system messages (like automatic status updates)
      if (thread.properties && thread.properties['System.CommentType'] &&
          thread.properties['System.CommentType'].value === 'system') {
        continue;
      }

      // Skip if there are no comments in the thread
      if (!thread.comments || thread.comments.length === 0) {
        continue;
      }

      // Get the file path if this is a code comment
      const filePath = thread.threadContext?.filePath;

      // Process each comment in the thread
      for (const comment of thread.comments) {
        // Skip system comments
        if (comment.commentType && comment.commentType === GitInterfaces.CommentType.System) {
          continue;
        }

        // Skip deleted comments if they have no content
        if (comment.isDeleted || !comment.content) {
          continue;
        }

        // Add the comment to our result array
        comments.push({
          id: comment.id || 0,
          content: comment.content || '',
          author: comment.author?.displayName || 'Unknown',
          createdDate: comment.publishedDate ? new Date(comment.publishedDate) : new Date(),
          lastUpdatedDate: comment.lastUpdatedDate ? new Date(comment.lastUpdatedDate) : new Date(),
          status: thread.status ? thread.status.toString() : undefined,
          filePath: filePath,
          threadId: thread.id || 0,
          parentCommentId: comment.parentCommentId
        });
      }
    }

    // Sort comments by creation date (oldest first)
    return comments.sort((a, b) => a.createdDate.getTime() - b.createdDate.getTime());
  } catch (error) {
    console.error(`Error getting comments for pull request ${pullRequest.pullRequestId}:`, error);
    throw error;
  }
}

/**
 * Options for adding a comment to a pull request
 */
export interface AddCommentOptions {
  /** The content of the comment */
  content: string;
  /** The file path to comment on (for file-specific comments) */
  filePath?: string;
  /** The line number to comment on (for line-specific comments) */
  lineNumber?: number;
  /** The parent comment ID (for replies) */
  parentCommentId?: number;
  /** The thread ID (for adding to existing threads) */
  threadId?: number;
}

/**
 * Add a comment to a pull request
 * @param pullRequest The pull request object
 * @param commentContent The content of the comment or comment options
 * @returns Promise with the created comment thread
 */
export async function addCommentToPullRequest(
  pullRequest: GitInterfaces.GitPullRequest,
  commentContent: string | AddCommentOptions
): Promise<GitInterfaces.GitPullRequestCommentThread | null> {
  try {
    // Ensure the pull request has a repository and ID
    if (!pullRequest.repository || !pullRequest.repository.id) {
      throw new Error('Pull request does not have a valid repository');
    }

    if (!pullRequest.pullRequestId) {
      throw new Error('Pull request does not have a valid ID');
    }

    // Get the Git API client
    const gitApi = await getGitApi();

    // Extract repository ID and pull request ID from the pull request object
    const repositoryId = pullRequest.repository.id;
    const pullRequestId = pullRequest.pullRequestId;

    // Process the comment content
    let options: AddCommentOptions;
    if (typeof commentContent === 'string') {
      options = { content: commentContent };
    } else {
      options = commentContent;
    }

    if (options.content == null || options.content == undefined || options.content == '') {
      return null;
    }

    // If we have a threadId, we're adding to an existing thread
    if (options.threadId) {
      // Get the existing thread
      const thread = await gitApi.getPullRequestThread(
        repositoryId,
        pullRequestId,
        options.threadId,
        project || ''
      );

      if (!thread) {
        throw new Error(`Thread with ID ${options.threadId} not found`);
      }

      // Create a comment object
      const comment: GitInterfaces.Comment = {
        content: options.content,
        parentCommentId: options.parentCommentId
      };

      // Add the comment to the thread
      await gitApi.createComment(
        comment,
        repositoryId,
        pullRequestId,
        options.threadId,
        project || ''
      );

      return thread;
    } else {
      // We're creating a new thread
      const thread: GitInterfaces.GitPullRequestCommentThread = {
        comments: [
          {
            content: options.content
          }
        ],
        status: GitInterfaces.CommentThreadStatus.Active
      };

      // If we have a file path, add thread context for a file comment
      if (options.filePath) {
        thread.threadContext = {
          filePath: options.filePath
        };

        // If we have a line number, add it to the context
        if (options.lineNumber) {
          thread.threadContext.rightFileStart = {
            line: options.lineNumber,
            offset: 1
          };
          thread.threadContext.rightFileEnd = {
            line: options.lineNumber,
            offset: 1
          };
        }
      }

      // Create the thread
      return await gitApi.createThread(
        thread,
        repositoryId,
        pullRequestId,
        project || ''
      );
    }
  } catch (error) {
    console.error(`Error adding comment to pull request ${pullRequest.pullRequestId}:`, error);
    throw error;
  }
}
