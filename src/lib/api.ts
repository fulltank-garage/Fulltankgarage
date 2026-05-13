import axios from 'axios'

const devApiBaseUrl = 'http://localhost:8080/api'

const getApiBaseUrl = () => {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '')
  }

  if (import.meta.env.DEV) {
    return devApiBaseUrl
  }

  console.error('Missing VITE_API_BASE_URL for production build')
  return '/api'
}

export const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15000,
})
