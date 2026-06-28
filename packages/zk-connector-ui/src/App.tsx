import { useEffect, useMemo, useState } from 'react';

import {
  PROTOCOL_VERSION,
  buildApprovedSessionPayload,
  decodeSessionApprovalRequest,
  encryptSession,
  type RelayStatusResponse,
  type SessionApprovalRequest
} from '@zk-agent/agent-session-protocol';

function readFallbackParams(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  return {
    rid: params.get('rid') || '',
    wallet: params.get('wallet') || '',
    chain: params.get('chain') || '',
    chainId: params.get('chainId') || '',
    provider: params.get('provider') || '',
    callbackUrl: params.get('callbackUrl') || '',
    relayRequestUrl: params.get('relayRequestUrl') || ''
  };
}

function normalizeCallbackUrl(value: string): string {
  if (!value) return '';

  try {
    return new URL(value).toString();
  } catch {
    return '';
  }
}

function readEncodedRequest(): SessionApprovalRequest | null {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  const encoded = params.get('request');
  if (!encoded) return null;

  try {
    return decodeSessionApprovalRequest(encoded);
  } catch {
    return null;
  }
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function hasRelayRequest(value: RelayStatusResponse | { error?: string }): value is RelayStatusResponse {
  return 'request_id' in value;
}

function normalizeAbsoluteUrl(value: string): string {
  if (!value) return '';

  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return '';
  }
}

function relayApproveCommand(
  request: SessionApprovalRequest | null,
  relayRequestUrl: string
): string {
  if (!request || !relayRequestUrl) {
    return 'zk-agent wallet request approve --request-id <id> --relay-url <relay-url> --code <code>';
  }

  return `zk-agent wallet request approve --request-id ${request.requestId} --relay-url ${relayRequestUrl.replace(/\/api\/requests\/[^/]+$/, '')} --code <code>`;
}

export function App() {
  const fallback = readFallbackParams();
  const encodedRequest = useMemo(() => readEncodedRequest(), []);
  const relayRequestUrl = useMemo(
    () => normalizeAbsoluteUrl(fallback.relayRequestUrl),
    [fallback.relayRequestUrl]
  );
  const callbackUrl = useMemo(() => normalizeCallbackUrl(fallback.callbackUrl), [fallback.callbackUrl]);
  const [request, setRequest] = useState<SessionApprovalRequest | null>(encodedRequest);
  const [requestLoadError, setRequestLoadError] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [ownerAddress, setOwnerAddress] = useState('');
  const [sessionAddress, setSessionAddress] = useState('');
  const [sessionPrivateKey, setSessionPrivateKey] = useState('');
  const [validatorAddress, setValidatorAddress] = useState('');
  const [paymasterAddress, setPaymasterAddress] = useState('');
  const [paymasterToken, setPaymasterToken] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [submitStatus, setSubmitStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRelayRequest() {
      if (encodedRequest || !relayRequestUrl) return;

      try {
        const response = await fetch(relayRequestUrl);
        const body = (await response.json()) as RelayStatusResponse | { error?: string };
        if (!response.ok) {
          throw new Error('error' in body && body.error ? body.error : `Relay request fetch failed with status ${response.status}`);
        }

        if (!cancelled && hasRelayRequest(body)) {
          setRequest(body.request || null);
          setRequestLoadError(body.request ? '' : 'Relay request did not include an approval payload request.');
        }
      } catch (error) {
        if (!cancelled) {
          setRequestLoadError(error instanceof Error ? error.message : 'Failed to load relay request.');
        }
      }
    }

    void loadRelayRequest();

    return () => {
      cancelled = true;
    };
  }, [encodedRequest, relayRequestUrl]);

  const approvedPayload = useMemo(() => {
    if (!request || !walletAddress) return null;

    try {
      return buildApprovedSessionPayload({
        request,
        walletAddress,
        ownerAddress: ownerAddress || undefined,
        sessionAddress: sessionAddress || undefined,
        sessionPrivateKey: sessionPrivateKey || undefined,
        validatorAddress: validatorAddress || undefined,
        paymasterAddress: paymasterAddress || undefined,
        paymasterToken: paymasterToken || undefined,
        connectorOrigin: window.location.origin,
        connectorUrl: `${window.location.origin}${window.location.pathname}`
      });
    } catch {
      return null;
    }
  }, [
    ownerAddress,
    paymasterAddress,
    paymasterToken,
    request,
    sessionAddress,
    sessionPrivateKey,
    validatorAddress,
    walletAddress
  ]);

  const generatedPayload = useMemo(() => {
    if (!approvedPayload) return '';
    return JSON.stringify(approvedPayload, null, 2);
  }, [approvedPayload]);

  const encryptedRelayPackage = useMemo(() => {
    if (!approvedPayload || !request?.sessionPublicKey) return null;

    try {
      return encryptSession(approvedPayload, request.sessionPublicKey, request.requestId);
    } catch {
      return null;
    }
  }, [approvedPayload, request]);

  const generatedEncryptedPayload = useMemo(() => {
    if (!encryptedRelayPackage) return '';
    return JSON.stringify(encryptedRelayPackage.encrypted, null, 2);
  }, [encryptedRelayPackage]);

  const finalizeCommand = useMemo(() => {
    if (!request) return '';
    return `zk-agent wallet request approve --request-id ${request.requestId} --payload @approved-session.json`;
  }, [request]);

  const finalizeRelayCommand = useMemo(
    () => relayApproveCommand(request, relayRequestUrl),
    [request, relayRequestUrl]
  );

  return (
    <main className="page">
      <section className="card">
        <p className="eyebrow">zk-agent connector</p>
        <h1>Session approval draft</h1>
        <p className="lede">
          This screen understands local callback approval, manual payload export, and encrypted
          relay-package submission.
        </p>

        <dl className="meta">
          <div>
            <dt>Protocol</dt>
            <dd>{PROTOCOL_VERSION}</dd>
          </div>
          <div>
            <dt>Request ID</dt>
            <dd>{request?.requestId || fallback.rid || 'n/a'}</dd>
          </div>
          <div>
            <dt>Wallet</dt>
            <dd>{request?.walletName || fallback.wallet || 'n/a'}</dd>
          </div>
          <div>
            <dt>Chain</dt>
            <dd>{request?.chain || fallback.chain || 'n/a'}</dd>
          </div>
          <div>
            <dt>Chain ID</dt>
            <dd>{request?.chainId || fallback.chainId || 'n/a'}</dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>{request?.provider || fallback.provider || 'n/a'}</dd>
          </div>
          <div>
            <dt>Account</dt>
            <dd>{request?.requestedAccountKind || 'n/a'}</dd>
          </div>
          <div>
            <dt>Paymaster</dt>
            <dd>{request?.requestedPaymasterMode || 'n/a'}</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>{request?.expiresAt || 'n/a'}</dd>
          </div>
        </dl>

        {request ? (
          <>
            <section className="panel">
              <h2>Requested capabilities</h2>
              <div className="chip-row">
                <span className="chip">read: {String(request.requestedCapabilities.read)}</span>
                <span className="chip">write: {String(request.requestedCapabilities.write)}</span>
                <span className="chip">transfer: {String(request.requestedCapabilities.transfer)}</span>
                <span className="chip">call: {String(request.requestedCapabilities.contractCall)}</span>
                <span className="chip">paymaster: {String(request.requestedCapabilities.paymaster)}</span>
              </div>
            </section>

            <section className="panel">
              <h2>Approve and generate session payload</h2>
              <div className="form-grid">
                <label>
                  <span>Wallet address</span>
                  <input
                    value={walletAddress}
                    onChange={(event) => setWalletAddress(event.target.value.trim())}
                    placeholder="0x..."
                  />
                </label>
                <label>
                  <span>Owner address</span>
                  <input
                    value={ownerAddress}
                    onChange={(event) => setOwnerAddress(event.target.value.trim())}
                    placeholder="Optional 0x... if session private key is provided"
                  />
                </label>
                <label>
                  <span>Session address</span>
                  <input
                    value={sessionAddress}
                    onChange={(event) => setSessionAddress(event.target.value.trim())}
                    placeholder="Optional 0x..."
                  />
                </label>
                <label>
                  <span>Session private key</span>
                  <input
                    value={sessionPrivateKey}
                    onChange={(event) => setSessionPrivateKey(event.target.value.trim())}
                    placeholder="Optional 0x... for writable testnet sessions"
                  />
                </label>
                <label>
                  <span>Validator address</span>
                  <input
                    value={validatorAddress}
                    onChange={(event) => setValidatorAddress(event.target.value.trim())}
                    placeholder="Optional 0x..."
                  />
                </label>
                <label>
                  <span>Paymaster address</span>
                  <input
                    value={paymasterAddress}
                    onChange={(event) => setPaymasterAddress(event.target.value.trim())}
                    placeholder="Optional 0x..."
                  />
                </label>
                <label>
                  <span>Paymaster token</span>
                  <input
                    value={paymasterToken}
                    onChange={(event) => setPaymasterToken(event.target.value.trim())}
                    placeholder="Optional 0x... for approval-based mode"
                  />
                </label>
              </div>
              <p className="helper">
                {callbackUrl
                  ? 'Approve in the connector to return the session directly to the waiting CLI process. Copy payload remains available as a fallback.'
                  : relayRequestUrl
                    ? `Approve here to submit the encrypted relay package, then finalize from the CLI with \`${finalizeRelayCommand}\`.`
                  : `Save the generated JSON and finalize it with \`${finalizeCommand || 'zk-agent wallet request approve --request-id <id> --payload @approved-session.json'}\`.`}
              </p>
              <textarea
                className="payload"
                readOnly
                value={
                  generatedPayload ||
                  'Enter a valid wallet address and, for smart-account approval, either an owner address or a session private key.'
                }
              />
              <div className="actions">
                {callbackUrl ? (
                  <button
                    type="button"
                    disabled={!approvedPayload || isSubmitting}
                    onClick={async () => {
                      if (!request || !approvedPayload || !callbackUrl) return;

                      setIsSubmitting(true);
                      setSubmitStatus('');

                      try {
                        const response = await fetch(callbackUrl, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({
                            requestId: request.requestId,
                            payload: approvedPayload
                          })
                        });

                        const body = (await response.json().catch(() => null)) as
                          | { error?: string; wallet?: { walletName?: string } }
                          | null;

                        if (!response.ok) {
                          throw new Error(
                            body?.error ||
                              `Local approval callback failed with status ${response.status}`
                          );
                        }

                        const approvedWalletName = body?.wallet?.walletName;
                        setSubmitStatus(
                          approvedWalletName
                            ? `Approved and returned to CLI for wallet ${approvedWalletName}.`
                            : 'Approved and returned to the waiting CLI process.'
                        );
                      } catch (error) {
                        setSubmitStatus(
                          error instanceof Error ? error.message : 'Failed to return approval to CLI.'
                        );
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                  >
                    {isSubmitting ? 'Approving...' : 'Approve In CLI'}
                  </button>
                ) : relayRequestUrl ? (
                  <button
                    type="button"
                    disabled={!encryptedRelayPackage || isSubmitting}
                    onClick={async () => {
                      if (!relayRequestUrl || !encryptedRelayPackage) return;

                      setIsSubmitting(true);
                      setSubmitStatus('');

                      try {
                        const response = await fetch(`${relayRequestUrl}/approval`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({
                            encrypted_payload: encryptedRelayPackage.encrypted
                          })
                        });
                        const body = (await response.json().catch(() => null)) as
                          | { error?: string; approval_ready?: boolean }
                          | null;

                        if (!response.ok) {
                          throw new Error(
                            body?.error || `Relay approval submission failed with status ${response.status}`
                          );
                        }

                        setSubmitStatus(
                          body?.approval_ready
                            ? 'Encrypted relay payload submitted. Send the approval code to the CLI operator out-of-band.'
                            : 'Relay accepted the approval package.'
                        );
                      } catch (error) {
                        setSubmitStatus(
                          error instanceof Error ? error.message : 'Failed to submit encrypted relay payload.'
                        );
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit To Relay'}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!generatedPayload}
                  onClick={async () => {
                    const ok = await copyText(generatedPayload);
                    setCopyStatus(ok ? 'Payload copied to clipboard.' : 'Clipboard copy failed.');
                  }}
                >
                  Copy payload
                </button>
                <button
                  type="button"
                  disabled={!generatedEncryptedPayload}
                  onClick={async () => {
                    const ok = await copyText(generatedEncryptedPayload);
                    setCopyStatus(ok ? 'Encrypted relay payload copied to clipboard.' : 'Clipboard copy failed.');
                  }}
                >
                  Copy encrypted payload
                </button>
                <button
                  type="button"
                  disabled={!encryptedRelayPackage?.code}
                  onClick={async () => {
                    const ok = encryptedRelayPackage?.code
                      ? await copyText(encryptedRelayPackage.code)
                      : false;
                    setCopyStatus(ok ? 'Relay approval code copied to clipboard.' : 'Clipboard copy failed.');
                  }}
                >
                  Copy approval code
                </button>
                {copyStatus ? <p className="status">{copyStatus}</p> : null}
                {submitStatus ? <p className="status">{submitStatus}</p> : null}
              </div>
            </section>

            <section className="panel">
              <h2>Encrypted relay fallback</h2>
              <p className="helper">
                This package can be sent through an untrusted relay because the CLI still needs the
                approval code to decrypt it. Finalize it with
                {` \`${relayRequestUrl ? finalizeRelayCommand : request ? `zk-agent wallet request approve --request-id ${request.requestId} --encrypted-payload @encrypted-session.json --code ${encryptedRelayPackage?.code || '<code>'}` : 'zk-agent wallet request approve --request-id <id> --encrypted-payload @encrypted-session.json --code <code>'}\`.`}
              </p>
              <label>
                <span>Approval code</span>
                <input readOnly value={encryptedRelayPackage?.code || ''} placeholder="Generated after valid approval data exists" />
              </label>
              <textarea
                className="payload"
                readOnly
                value={
                  generatedEncryptedPayload ||
                  'Enter a valid wallet address and approval metadata to generate an encrypted relay package.'
                }
              />
            </section>
          </>
        ) : (
          <div className="callout">
            {requestLoadError
              ? requestLoadError
              : 'This page did not receive an encoded request payload in the URL hash or through relayRequestUrl.'}
          </div>
        )}
      </section>
    </main>
  );
}
