import { MAX_GIT_CONTEXT_FILE_BYTES, isPathExcluded, parseGitignoreContent, type ParsedPattern } from './gitFilter';

export interface GitHubRepo {
  full_name: string;
  default_branch: string;
  private: boolean;
}

export interface GitHubFile {
  path: string;
  type: 'blob' | 'tree';
  url: string;
  size?: number;
}

interface GitHubTreeResponse {
  tree?: Array<GitHubFile>;
}

interface GitHubContentResponse {
  content?: string;
  encoding?: string;
}

const GITHUB_API_ACCEPT = 'application/vnd.github+json';

function getApiHeaders(token: string) {
  return {
    Accept: GITHUB_API_ACCEPT,
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function parseError(response: Response) {
  const text = await response.text().catch(() => '');
  if (!text) {
    return `GitHub request failed with ${response.status}`;
  }

  try {
    const parsed = JSON.parse(text) as { error?: string; error_description?: string; message?: string };
    return parsed.error_description ?? parsed.message ?? parsed.error ?? `GitHub request failed with ${response.status}`;
  } catch {
    return text;
  }
}

function decodeBase64Utf8(value: string) {
  const normalized = value.replace(/\n/g, '');
  const bytes = Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeRepoPath(path: string) {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

async function loadGitignorePatterns(token: string, fullName: string): Promise<ParsedPattern[]> {
  const response = await fetch(
    `https://api.github.com/repos/${fullName}/contents/${encodeRepoPath('.gitignore')}`,
    { headers: getApiHeaders(token) },
  );

  // 404 = repo has no .gitignore — that's expected, return empty list silently.
  if (response.status === 404) {
    return [];
  }

  // Anything else (401, 403, 429, 5xx) is a real error that the caller should surface.
  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = await response.json() as GitHubContentResponse;
  if (data.encoding !== 'base64' || !data.content) {
    return [];
  }

  return parseGitignoreContent(decodeBase64Utf8(data.content));
}

export async function startGitHubDeviceFlow(clientId: string): Promise<{
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
}> {
  const response = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ client_id: clientId, scope: 'repo read:user' }),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = await response.json() as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    interval?: number;
  };

  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    interval: data.interval ?? 5,
  };
}

export async function pollGitHubToken(
  clientId: string,
  deviceCode: string,
  interval: number,
  signal?: AbortSignal,
): Promise<string> {
  let currentInterval = interval;

  while (true) {
    signal?.throwIfAborted();

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    const data = await response.json() as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (data.access_token) {
      return data.access_token;
    }

    if (data.error === 'authorization_pending') {
      await new Promise((resolve) => window.setTimeout(resolve, currentInterval * 1000));
      continue;
    }

    if (data.error === 'slow_down') {
      currentInterval += 5;
      await new Promise((resolve) => window.setTimeout(resolve, currentInterval * 1000));
      continue;
    }

    throw new Error(data.error_description ?? data.error ?? 'GitHub authorization failed.');
  }
}

export async function listGitHubRepos(token: string): Promise<GitHubRepo[]> {
  const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
    headers: getApiHeaders(token),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return await response.json() as GitHubRepo[];
}

export async function fetchRepoTree(token: string, fullName: string, branch: string): Promise<GitHubFile[]> {
  const response = await fetch(`https://api.github.com/repos/${fullName}/git/trees/${encodeURIComponent(branch)}?recursive=1`, {
    headers: getApiHeaders(token),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = await response.json() as GitHubTreeResponse;
  const gitignorePatterns = await loadGitignorePatterns(token, fullName);

  return (data.tree ?? []).filter((file) => {
    if (file.type !== 'blob' || !file.path) {
      return false;
    }

    if (typeof file.size === 'number' && file.size > MAX_GIT_CONTEXT_FILE_BYTES) {
      return false;
    }

    return !isPathExcluded(file.path, gitignorePatterns);
  });
}

export async function fetchFileContent(token: string, fullName: string, path: string): Promise<string> {
  const response = await fetch(`https://api.github.com/repos/${fullName}/contents/${encodeRepoPath(path)}`, {
    headers: getApiHeaders(token),
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const data = await response.json() as GitHubContentResponse;
  if (data.encoding !== 'base64' || !data.content) {
    throw new Error(`Unsupported GitHub content encoding for ${path}.`);
  }

  return decodeBase64Utf8(data.content);
}