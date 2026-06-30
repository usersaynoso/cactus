// GitHub Git Data API integration for module install, update, and removal.
// Uses @octokit/rest — never shells out to git CLI.
// Module registry is stored in modules.json at the repo root (plain JSON, no git submodule machinery).

import { parseGitHubRepo } from './manifest'
import { getGithubClient } from '@/lib/github/client'

function getMainRepo(): { owner: string; repo: string } {
  const raw = process.env.GITHUB_REPO ?? ''
  const [owner, repo] = raw.split('/')
  if (!owner || !repo) {
    throw new Error('GITHUB_REPO environment variable must be set as "owner/repo"')
  }
  return { owner, repo }
}

export async function getLatestRelease(
  repoUrl: string
): Promise<{ tag: string; sha: string; body: string | null } | null> {
  const octokit = await getGithubClient()
  const { owner, repo } = parseGitHubRepo(repoUrl)

  try {
    const { data } = await octokit.rest.repos.getLatestRelease({ owner, repo })
    const tagRef = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `tags/${data.tag_name}`,
    })
    const tagSha = tagRef.data.object.sha
    let commitSha = tagSha
    if (tagRef.data.object.type === 'tag') {
      const tag = await octokit.rest.git.getTag({ owner, repo, tag_sha: tagSha })
      commitSha = tag.data.object.sha
    }
    return { tag: data.tag_name, sha: commitSha, body: data.body ?? null }
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 404) return null
    throw err
  }
}

interface ModuleEntry {
  name: string
  repoUrl: string
  version: string
}

interface ModulesJson {
  modules: ModuleEntry[]
}

async function readModulesJson(
  octokit: Awaited<ReturnType<typeof getGithubClient>>,
  owner: string,
  repo: string
): Promise<{ content: ModulesJson; fileSha: string | null }> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path: 'modules.json' })
    if ('content' in data) {
      const parsed = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')) as ModulesJson
      return { content: parsed, fileSha: data.sha }
    }
  } catch {
    // File doesn't exist yet
  }
  return { content: { modules: [] }, fileSha: null }
}

async function commitModulesJson(
  octokit: Awaited<ReturnType<typeof getGithubClient>>,
  owner: string,
  repo: string,
  updated: ModulesJson,
  message: string,
  deleteGitmodules = false
): Promise<{ commitSha: string }> {
  const { data: ref } = await octokit.rest.git.getRef({ owner, repo, ref: 'heads/main' })
  const headSha = ref.object.sha

  const { data: headCommit } = await octokit.rest.git.getCommit({ owner, repo, commit_sha: headSha })
  const baseTreeSha = headCommit.tree.sha

  const jsonContent = JSON.stringify(updated, null, 2) + '\n'
  const { data: blob } = await octokit.rest.git.createBlob({
    owner, repo,
    content: Buffer.from(jsonContent).toString('base64'),
    encoding: 'base64',
  })

  const treeItems: Array<{
    path: string
    mode: '100644' | '160000' | '040000' | '100755' | '120000'
    type: 'blob' | 'tree' | 'commit'
    sha: string | null
  }> = [
    { path: 'modules.json', mode: '100644', type: 'blob', sha: blob.sha },
  ]

  if (deleteGitmodules) {
    treeItems.push({ path: '.gitmodules', mode: '100644', type: 'blob', sha: null })
  }

  const { data: newTree } = await octokit.rest.git.createTree({
    owner, repo,
    base_tree: baseTreeSha,
    tree: treeItems,
  })

  const { data: newCommit } = await octokit.rest.git.createCommit({
    owner, repo,
    message,
    tree: newTree.sha,
    parents: [headSha],
  })

  await octokit.rest.git.updateRef({ owner, repo, ref: 'heads/main', sha: newCommit.sha })

  return { commitSha: newCommit.sha }
}

async function hasGitmodules(
  octokit: Awaited<ReturnType<typeof getGithubClient>>,
  owner: string,
  repo: string
): Promise<boolean> {
  try {
    await octokit.rest.repos.getContent({ owner, repo, path: '.gitmodules' })
    return true
  } catch {
    return false
  }
}

export async function commitModuleAdd(params: {
  name: string
  repoUrl: string
  version: string
  message: string
}): Promise<{ commitSha: string }> {
  const octokit = await getGithubClient()
  const { owner, repo } = getMainRepo()

  const { content } = await readModulesJson(octokit, owner, repo)
  content.modules.push({ name: params.name, repoUrl: params.repoUrl, version: params.version })

  const deleteGitmodules = await hasGitmodules(octokit, owner, repo)
  return commitModulesJson(octokit, owner, repo, content, params.message, deleteGitmodules)
}

export async function commitModuleUpdate(params: {
  name: string
  version: string
  message: string
}): Promise<{ commitSha: string }> {
  const octokit = await getGithubClient()
  const { owner, repo } = getMainRepo()

  const { content } = await readModulesJson(octokit, owner, repo)
  const entry = content.modules.find(m => m.name === params.name)
  if (!entry) throw new Error(`Module "${params.name}" not found in modules.json`)
  entry.version = params.version

  return commitModulesJson(octokit, owner, repo, content, params.message)
}

export async function commitModuleRemove(params: {
  name: string
  message: string
}): Promise<void> {
  const octokit = await getGithubClient()
  const { owner, repo } = getMainRepo()

  const { content } = await readModulesJson(octokit, owner, repo)
  content.modules = content.modules.filter(m => m.name !== params.name)

  await commitModulesJson(octokit, owner, repo, content, params.message)
}

export async function getLatestDeploymentStatus(): Promise<
  'READY' | 'ERROR' | 'BUILDING' | 'UNKNOWN'
> {
  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  if (!token || !projectId) return 'UNKNOWN'

  try {
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=1`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      }
    )
    if (!res.ok) return 'UNKNOWN'
    const data = (await res.json()) as {
      deployments?: Array<{ readyState: string }>
    }
    const state = data.deployments?.[0]?.readyState
    if (state === 'READY') return 'READY'
    if (state === 'ERROR' || state === 'CANCELED') return 'ERROR'
    if (state === 'BUILDING' || state === 'QUEUED' || state === 'INITIALIZING') return 'BUILDING'
    return 'UNKNOWN'
  } catch {
    return 'UNKNOWN'
  }
}
