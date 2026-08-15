/**
 * Envío de formularios directo a Web3Forms (sin backend propio).
 * La Access Key es pública por diseño de Web3Forms: identifica el formulario,
 * no autoriza acciones privilegiadas, por eso se expone como VITE_.
 */

export type Web3FormsPayload = Record<string, string | undefined | null>

interface Web3FormsResult {
  success: boolean
  message?: string
}

export async function submitToWeb3Forms(payload: Web3FormsPayload): Promise<Web3FormsResult> {
  const accessKey = import.meta.env.VITE_WEB3FORMS_ACCESS_KEY
  const endpoint = import.meta.env.VITE_WEB3FORMS_ENDPOINT || 'https://api.web3forms.com/submit'

  if (!accessKey) {
    throw new Error('Missing VITE_WEB3FORMS_ACCESS_KEY')
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      access_key: accessKey,
      ...payload,
    }),
  })

  const result: Web3FormsResult = await response.json()

  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Web3Forms submission failed')
  }

  return result
}
