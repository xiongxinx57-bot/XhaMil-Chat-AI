import {
  DEFAULT_ADMIN_BROWSER_TITLE,
  DEFAULT_APP_DISPLAY_NAME,
  DEFAULT_APP_NAV_BAR_TITLE,
  DEFAULT_APP_SPLASH_TAGLINE,
  DEFAULT_BROWSER_TITLE,
  DEFAULT_LOGIN_WELCOME_TITLE,
  DEFAULT_NAV_BAR_TITLE,
  DEFAULT_REGISTER_WELCOME_TITLE,
  loadConfig,
  saveConfig
} from './config.js'

export {
  DEFAULT_ADMIN_BROWSER_TITLE,
  DEFAULT_APP_DISPLAY_NAME,
  DEFAULT_APP_NAV_BAR_TITLE,
  DEFAULT_APP_SPLASH_TAGLINE,
  DEFAULT_BROWSER_TITLE,
  DEFAULT_LOGIN_WELCOME_TITLE,
  DEFAULT_NAV_BAR_TITLE,
  DEFAULT_REGISTER_WELCOME_TITLE
}

function normalizeTitle(value, fallback) {
  const text = String(value ?? '').trim()
  if (!text) return fallback
  if (text.length > 64) throw new Error('标题不能超过 64 个字符')
  return text
}

export function getFrontendBranding(config = loadConfig()) {
  return {
    browserTitle: normalizeTitle(config.frontendBrowserTitle, DEFAULT_BROWSER_TITLE),
    navBarTitle: normalizeTitle(config.frontendNavBarTitle, DEFAULT_NAV_BAR_TITLE),
    adminBrowserTitle: normalizeTitle(config.adminBrowserTitle, DEFAULT_ADMIN_BROWSER_TITLE),
    loginWelcomeTitle: normalizeTitle(config.loginWelcomeTitle, DEFAULT_LOGIN_WELCOME_TITLE),
    registerWelcomeTitle: normalizeTitle(config.registerWelcomeTitle, DEFAULT_REGISTER_WELCOME_TITLE),
    appDisplayName: normalizeTitle(config.appDisplayName, DEFAULT_APP_DISPLAY_NAME),
    appNavBarTitle: normalizeTitle(config.appNavBarTitle, DEFAULT_APP_NAV_BAR_TITLE),
    appSplashTagline: normalizeTitle(config.appSplashTagline, DEFAULT_APP_SPLASH_TAGLINE)
  }
}

export function getFrontendBrandingPublic(config = loadConfig()) {
  return getFrontendBranding(config)
}

export function saveFrontendBranding(body = {}) {
  const current = getFrontendBranding()
  const browserTitle =
    body.browserTitle !== undefined
      ? normalizeTitle(body.browserTitle, DEFAULT_BROWSER_TITLE)
      : current.browserTitle
  const navBarTitle =
    body.navBarTitle !== undefined
      ? normalizeTitle(body.navBarTitle, DEFAULT_NAV_BAR_TITLE)
      : current.navBarTitle
  const adminBrowserTitle =
    body.adminBrowserTitle !== undefined
      ? normalizeTitle(body.adminBrowserTitle, DEFAULT_ADMIN_BROWSER_TITLE)
      : current.adminBrowserTitle
  const loginWelcomeTitle =
    body.loginWelcomeTitle !== undefined
      ? normalizeTitle(body.loginWelcomeTitle, DEFAULT_LOGIN_WELCOME_TITLE)
      : current.loginWelcomeTitle
  const registerWelcomeTitle =
    body.registerWelcomeTitle !== undefined
      ? normalizeTitle(body.registerWelcomeTitle, DEFAULT_REGISTER_WELCOME_TITLE)
      : current.registerWelcomeTitle
  // App 名称 / 顶栏 / 启动标语：卖给客户后由卖方定制，管理后台不可改
  saveConfig({
    frontendBrowserTitle: browserTitle,
    frontendNavBarTitle: navBarTitle,
    adminBrowserTitle,
    loginWelcomeTitle,
    registerWelcomeTitle
  })
  return getFrontendBranding()
}
