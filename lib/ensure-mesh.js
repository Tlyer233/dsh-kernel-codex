// Mesh fallback mount. The kernel model routes and the L2 subagent recipes
// are owned by dsh-kernel-mesh; the host composition normally mounts it once
// as a profile bundle and every vendor package shares that one instance.
// When no mesh is mounted (its `kernelMesh` marker service absent AND no
// kernel route registered) and the mesh package is installed — it is a
// declared dependency of this package — mount it from here so the vendor
// surface keeps working. A mesh mounted this way shares THIS row's lifecycle
// (its routes disappear when the row unloads), so the profile-level mount
// remains the preferred form: `dsh plugin add dsh-kernel-mesh`.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const KERNEL_ROUTES = ['kimi-kernel', 'grok-kernel', 'codex-kernel', 'minimax-kernel']
const MESH_PACKAGE = 'dsh-kernel-mesh'

/** The host's profile context, when this row is mounted under a `dsh` profile. */
function profileOf(ctx) {
  try { return ctx.get('profileContext') } catch { return undefined }
}

/**
 * Absolute path of the installed mesh package, resolved from the profile that
 * owns this row. A `link:`-installed plugin (or any plugin hoisted outside the
 * profile tree) cannot resolve its own bare dependency, so resolution is
 * anchored at the profile directory — the same anchor the loader used to start
 * this row.
 */
function resolveMesh(profile) {
  const anchors = []
  if (profile && typeof profile.dir === 'string') anchors.push(profile.dir)
  if (profile && typeof profile.installAnchor === 'string') anchors.push(path.dirname(profile.installAnchor))
  anchors.push(process.cwd())
  for (const anchor of anchors) {
    try {
      return createRequire(path.join(anchor, 'package.json')).resolve(MESH_PACKAGE)
    } catch {}
  }
  return null
}

export async function ensureKernelMesh(ctx, tag) {
  // A mesh mounted anywhere above this scope exposes the marker service.
  try { if (ctx.get('kernelMesh')) return } catch {}

  const profile = profileOf(ctx)
  // The host composition starts bundles concurrently, so this row can run
  // before the mesh has provided `kernelMesh`. `startedBundles` is fixed by the
  // loader up front: when the profile owns the mesh, the host mount is on its
  // way and this fallback must stay out of it (a second mount would lose the
  // `kernelMesh` mutex and warn for nothing).
  const bundles = profile && Array.isArray(profile.startedBundles) ? profile.startedBundles : []
  if (bundles.indexOf(MESH_PACKAGE) >= 0) return

  const llm = ctx.get('llm')
  if (!llm || typeof llm.listProviders !== 'function') return
  try {
    if ((llm.listProviders() || []).some((p) => p && KERNEL_ROUTES.indexOf(p.id) >= 0)) return
  } catch {}

  let spec = MESH_PACKAGE
  try {
    // Dev layout: sibling checkout <workspace>/dsh-kernel-mesh/lib/index.js.
    const sibling = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'dsh-kernel-mesh', 'lib', 'index.js')
    if (fs.existsSync(sibling)) spec = pathToFileURL(sibling).href
  } catch {}
  if (spec === MESH_PACKAGE) {
    const resolved = resolveMesh(profile)
    if (resolved !== null) spec = pathToFileURL(resolved).href
  }

  try {
    const mesh = await import(spec)
    ctx.plugin(mesh)
    console.warn('[' + tag + '] dsh-kernel-mesh is not mounted by the host composition; mounted from this plugin instead.' +
      ' Its kernel routes share this row\'s lifecycle — prefer a profile-level mount: dsh plugin add dsh-kernel-mesh.' +
      ' (When several rows race to do this, only the first mesh survives: its kernelMesh service is the mutex.)')
  } catch (e) {
    console.warn('[' + tag + '] dsh-kernel-mesh not mounted and could not be loaded (' + String((e && e.message) || e) + ').' +
      ' Kernel routes and subagent recipes are unavailable; install it with: dsh plugin add dsh-kernel-mesh')
  }
}
