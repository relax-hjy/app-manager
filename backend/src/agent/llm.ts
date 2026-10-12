/**
 * LLM 决策层：为安装智能体输出结构化安装策略（JSON）。
 * 模型 claude-opus-5（官方 SDK + zod 结构化输出）；不可用/失败时由 installer 降级规则表。
 */
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { getDb, queryAll } from '../database'

const MODEL = process.env.APP_LLM_MODEL || 'mimo-v2.6-pro'

/** 安装策略（LLM 输出与规则表共用） */
export interface InstallPlan {
  strategy: 'silent' | 'zip' | 'interactive'
  command: string
  args: string[]
  expectedExitCodes: number[]
  targetDir?: string
  notes: string
}

/** repairPlan 的结论：放弃，或给出新计划 */
export interface RepairResult {
  giveUp: boolean
  reason?: string
  plan?: InstallPlan
}

/** planInstall 的输入上下文（易变内容全部放 user message，system 固定以启 prompt cache） */
export interface PlanContext {
  appName: string
  pkgPath: string
  pkgType: 'exe' | 'zip'
  pkgSize: number
  detectedType: string
  installDir: string
}

const InstallPlanSchema = z.object({
  strategy: z.enum(['silent', 'zip', 'interactive']),
  command: z.string(),
  args: z.array(z.string()),
  expectedExitCodes: z.array(z.number()),
  targetDir: z.string().optional(),
  notes: z.string(),
})

const RepairResultSchema = z.object({
  giveUp: z.boolean(),
  reason: z.string().optional(),
  plan: InstallPlanSchema.optional(),
})

const PickExeSchema = z.object({
  path: z.string(),
  reason: z.string(),
})

/** 固定 system prompt（内容稳定，配合 prompt cache） */
const SYSTEM_PROMPT = [
  '你是 Windows 软件静默安装专家，为本地安装包管理器输出安装策略 JSON。',
  '可选 strategy：silent（静默安装 EXE/MSI）、zip（解压即用的绿色软件）、interactive（无法静默，只能弹窗手装）。',
  '常见静默参数：NSIS 用 /S；Inno Setup 用 /VERYSILENT /SUPPRESSMSGBOXES /NORESTART；MSI 用 msiexec /i <pkg> /quiet /norestart；Squirrel 用 --silent。',
  'zip：command 用 powershell.exe，args 形如 ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath \'<pkg>\' -DestinationPath \'<targetDir>\' -Force"]（不要用 tar，GNU tar 会把 Windows 盘符路径误判为远程主机）。',
  'silent 的 command 填安装包完整路径（exe 自身），或 msiexec（msi）；expectedExitCodes 通常为 [0]，MSI 成功重启码 3010 也算成功。',
  'targetDir 填期望安装到的目录（一般为 <installDir>\\<应用名>）。',
  'notes 用一句话说明你的判断依据。',
  '修复模式：给出失败原因分析与新 plan；确实无法静默安装时 giveUp=true 并说明 reason。',
].join('\n')

/**
 * 取 Anthropic 客户端；无可用 API Key 时返回 null（调用方降级规则表）。
 * Key 解析顺序：环境变量 ANTHROPIC_API_KEY → config 表 anthropic_api_key。
 */
export async function getClient(): Promise<Anthropic | null> {
  const apiKey = await getApiKey()
  if (!apiKey) return null
  return new Anthropic({ apiKey })
}

/** 智能体是否可用 LLM（仅探测配置，不发请求） */
export async function isLlmAvailable(): Promise<boolean> {
  return (await getApiKey()) !== undefined
}

async function getApiKey(): Promise<string | undefined> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  if (process.env.ANTHROPIC_AUTH_TOKEN) return process.env.ANTHROPIC_AUTH_TOKEN
  const db = await getDb()
  const rows = queryAll(db, 'SELECT value FROM config WHERE key = ?', ['anthropic_api_key'])
  const value = (rows[0] as { value?: string } | undefined)?.value
  return value && value.trim() ? value.trim() : undefined
}

/**
 * 为安装包生成安装策略。
 * @param ctx 包信息与启发式识别结果
 * @returns 结构化安装计划；LLM 不可用/调用失败/输出非法时抛错（由调用方降级）
 */
export async function planInstall(ctx: PlanContext): Promise<InstallPlan> {
  const client = await getClient()
  if (!client) throw new Error('LLM 不可用：未配置 API Key')
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `任务：为以下安装包生成安装计划。\n${JSON.stringify(ctx, null, 2)}` }],
    output_config: { format: zodOutputFormat(InstallPlanSchema) },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  })
  if (response.stop_reason === 'refusal') throw new Error('LLM 拒绝了该请求')
  const plan = response.parsed_output
  if (!plan || !plan.command) throw new Error('LLM 输出解析失败')
  return plan
}

/**
 * 失败诊断：让 LLM 基于失败计划与输出给出修复计划或放弃结论。
 * @param ctx 原始安装上下文
 * @param failedPlan 上一次失败的计划
 * @param logTail 安装器 stdout/stderr 尾部（≤2KB）
 * @returns 修复结论；LLM 不可用/失败时抛错
 */
export async function repairPlan(ctx: PlanContext, failedPlan: InstallPlan, logTail: string): Promise<RepairResult> {
  const client = await getClient()
  if (!client) throw new Error('LLM 不可用：未配置 API Key')
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        '任务：修复安装失败。上下文与失败信息如下，请给出新 plan 或 giveUp。',
        `安装上下文：${JSON.stringify(ctx, null, 2)}`,
        `失败计划：${JSON.stringify(failedPlan, null, 2)}`,
        `安装器输出尾部：\n${logTail.slice(-2048)}`,
      ].join('\n\n'),
    }],
    output_config: { format: zodOutputFormat(RepairResultSchema) },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  })
  if (response.stop_reason === 'refusal') throw new Error('LLM 拒绝了该请求')
  const result = response.parsed_output
  if (!result) throw new Error('LLM 输出解析失败')
  return result
}

/**
 * 多候选主 EXE 裁决：解压后目录里有多个 exe 时交给 LLM 选主程序。
 * @param appName 应用名
 * @param candidates 候选 exe 完整路径列表
 * @returns 选中的路径；LLM 失败时抛错（调用方取启发式最高分）
 */
export async function chooseMainExe(appName: string, candidates: string[]): Promise<string> {
  const client = await getClient()
  if (!client) throw new Error('LLM 不可用：未配置 API Key')
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `任务：解压绿色软件后，从候选 exe 中选出「应用主程序」路径（排除 unins*.exe、crashpad、helper 等辅助程序）。\n应用名：${appName}\n候选：${JSON.stringify(candidates, null, 2)}`,
    }],
    output_config: { format: zodOutputFormat(PickExeSchema) },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  })
  if (response.stop_reason === 'refusal') throw new Error('LLM 拒绝了该请求')
  const pick = response.parsed_output
  if (!pick || !candidates.includes(pick.path)) throw new Error('LLM 输出解析失败')
  return pick.path
}

/** 搜索引擎真实结果条目（下载链接候选的来源，防 LLM 幻觉） */
export interface SearchHit {
  url: string
  title: string
  snippet: string
}

/** 下载链接候选（LLM 排序输出） */
export interface DownloadLinkCandidate {
  url: string
  isDirect: boolean
  note: string
}

/** rankDownloadLinks 的结论：按可靠性降序的候选链接 */
export interface DownloadLinkResult {
  candidates: DownloadLinkCandidate[]
  notes: string
}

const DownloadLinkResultSchema = z.object({
  candidates: z.array(z.object({
    url: z.string().url(),
    isDirect: z.boolean(),
    note: z.string(),
  })).max(3),
  notes: z.string(),
})

/** 下载链接评估固定 system prompt（内容稳定，配合 prompt cache） */
const FIND_SYSTEM_PROMPT = [
  '你是 Windows 软件下载链接评估专家，为应用找出最可靠的官方下载链接。',
  '规则：优先厂商官网；直链安装包（exe/msi/zip 文件 URL）优先于官方下载页；避免第三方下载站（华军软件园、非凡软件站、腾讯软件中心、sourceforge 镜像等）。',
  '优先从给定搜索结果中挑选；结果不足 3 条或都不可靠时，可补充你确信存在的官方 URL（note 标注「凭知识推荐」）；宁缺毋滥，没有把握就少给。',
  'candidates 最多 3 条，按可靠性降序排列；isDirect 标注是否为直链安装包；note 用一句话说明来源与判断依据；notes 总结整体判断。',
  '只输出一个 JSON 对象（不要 markdown 围栏），格式：{"candidates":[{"url":"...","isDirect":true,"note":"..."}],"notes":"..."}。',
].join('\n')

/**
 * 从 LLM 文本中提取首个平衡的 JSON 对象（兼容 markdown 围栏与前后杂文）。
 * @param text LLM 输出文本
 * @returns 解析出的对象；找不到或非法时返回 null
 */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(text.slice(start, i + 1))
          return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/**
 * 从搜索结果中挑出最可靠的下载链接（LLM 排序，直链优先稳定排序）。
 * @param ctx 应用名/版本/描述（易变内容放 user message）
 * @param searchHits 搜索引擎真实结果；为空时降级为凭知识推荐（note 标注）
 * @param signal 取消信号（同时限定请求超时 120s）
 * @returns 最多 3 条按可靠性降序的候选；LLM 不可用/输出非法时抛错
 */
export async function rankDownloadLinks(
  ctx: { name: string; version: string; description: string },
  searchHits: SearchHit[],
  signal?: AbortSignal,
): Promise<DownloadLinkResult> {
  const client = await getClient()
  if (!client) throw new Error('LLM 不可用：未配置 API Key')
  const fromSearch = searchHits.length > 0
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: FIND_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        '任务：为以下 Windows 应用找出最可靠的下载链接。',
        `应用信息：${JSON.stringify(ctx, null, 2)}`,
        fromSearch
          ? `搜索结果（真实 URL，优先从中挑选）：\n${JSON.stringify(searchHits, null, 2)}`
          : '搜索暂不可用，请凭你对官方渠道的了解给出候选 URL，note 标注「凭知识推荐」。',
      ].join('\n\n'),
    }],
  }, { timeout: 120_000, signal })
  if (response.stop_reason === 'refusal') throw new Error('LLM 拒绝了该请求')
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')
  const obj = extractJsonObject(text)
  const parsed = DownloadLinkResultSchema.safeParse(obj)
  if (!parsed.success) throw new Error('LLM 输出解析失败')
  // 直链安装包稳定排前（保持 LLM 给出的相对可靠性顺序）
  const candidates = [
    ...parsed.data.candidates.filter(c => c.isDirect),
    ...parsed.data.candidates.filter(c => !c.isDirect),
  ]
  return { candidates, notes: parsed.data.notes }
}
