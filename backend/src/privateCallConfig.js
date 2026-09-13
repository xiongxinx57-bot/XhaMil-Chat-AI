import { loadConfig, saveConfig } from './config.js'

export function isPrivateCallDisabled(config = loadConfig()) {
  return !!config.privateCallDisabled
}

export function getPrivateCallConfig(config = loadConfig()) {
  return { disabled: isPrivateCallDisabled(config) }
}

export function getPrivateCallPublic(config = loadConfig()) {
  return getPrivateCallConfig(config)
}

export function savePrivateCallConfig(body = {}) {
  const disabled = body.disabled !== undefined ? !!body.disabled : isPrivateCallDisabled()
  saveConfig({ privateCallDisabled: disabled })
  return getPrivateCallConfig()
}
