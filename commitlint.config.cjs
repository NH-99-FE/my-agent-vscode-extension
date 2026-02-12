const scopes = ['docs', 'project', 'style', 'ci', 'dev', 'deploy', 'other']

/** @type {import('cz-git').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  parserPreset: 'conventional-changelog-conventionalcommits',
  rules: {
    'scope-enum': [2, 'always', scopes],
  },
  prompt: {
    settings: {},
    messages: {
      type: '请选择提交类型：',
      scope: '请选择影响范围（可选）：',
      customScope: '请输入自定义范围：',
      subject: '请填写简短描述（祈使句）：\n',
      body: '请填写详细描述（可选，使用 "|" 换行）：\n',
      breaking: '请填写 BREAKING CHANGE（可选，使用 "|" 换行）：\n',
      footerPrefixesSelect: '请选择关联 Issue 前缀（可选）：',
      customFooterPrefix: '请输入自定义 Issue 前缀：',
      footer: '请输入关联 Issue（可选，例如：#123）：\n',
      confirmCommit: '确认提交吗？',
      skip: '跳过',
      max: '最多 %d 个字符',
      min: '至少 %d 个字符',
      emptyWarning: '不能为空',
      upperLimitWarning: '超出长度限制',
      lowerLimitWarning: '低于最小长度',
    },
    types: [
      { value: 'feat', name: 'feat:     ✨  新功能', emoji: '✨ ' },
      { value: 'fix', name: 'fix:      🐛  修复问题', emoji: '🐛 ' },
      { value: 'docs', name: 'docs:     📝  文档变更', emoji: '📝 ' },
      { value: 'style', name: 'style:    💄  代码格式调整', emoji: '💄 ' },
      { value: 'refactor', name: 'refactor: 📦️  代码重构（非修复/新增）', emoji: '📦️ ' },
      { value: 'perf', name: 'perf:     🚀  性能优化', emoji: '🚀 ' },
      { value: 'test', name: 'test:     🚨  测试相关变更', emoji: '🚨 ' },
      { value: 'build', name: 'build:    🛠  构建系统或依赖变更', emoji: '🛠 ' },
      { value: 'ci', name: 'ci:       🎡  CI 配置或脚本变更', emoji: '🎡 ' },
      { value: 'chore', name: 'chore:    🔨  杂项变更（不改 src/test）', emoji: '🔨 ' },
      { value: 'revert', name: 'revert:   ⏪️  回滚提交', emoji: '⏪️ ' },
    ],
    useEmoji: true,
    confirmColorize: true,
    emojiAlign: 'center',
    questions: {
      scope: {
        description: '请选择本次变更范围（如模块名、文件夹名）',
      },
      subject: {
        description: '请填写简短描述（建议祈使句）',
      },
      body: {
        description: '请填写详细描述（可选）',
      },
      isBreaking: {
        description: '是否包含破坏性变更？',
      },
      breakingBody: {
        description: '破坏性变更需补充说明，请填写详细描述',
      },
      breaking: {
        description: '请描述破坏性变更内容',
      },
      isIssueAffected: {
        description: '是否关联 Issue？',
      },
      issuesBody: {
        description: '若要关闭 Issue，请补充详细说明',
      },
      issues: {
        description: '请填写 Issue 引用（例如: "fix #123", "re #123"）',
      },
    },
  },
}
