import { useEffect, useMemo, useState } from 'react';

import {
  PROTOCOL_VERSION,
  buildApprovedSessionPayload,
  deriveEthereumAddressFromPrivateKey,
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

function relayShareUrlFromStatus(relay: RelayStatusResponse | null): string {
  return relay?.approval_url || '';
}

function relayStatusTone(status: RelayStatusResponse['status'] | 'loading' | 'error'): string {
  switch (status) {
    case 'ready':
      return 'good';
    case 'expired':
      return 'bad';
    case 'pending':
    case 'loading':
      return 'warn';
    default:
      return 'muted';
  }
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return 'n/a';

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function relayApproveCommand(
  request: SessionApprovalRequest | null,
  relayRequestUrl: string
): string {
  if (!request || !relayRequestUrl) {
    return 'zk-agent wallet request approve --request-id <id> --relay-url <relay-url> --code <code> --wait';
  }

  return `zk-agent wallet request approve --request-id ${request.requestId} --relay-url ${relayRequestUrl.replace(/\/api\/requests\/[^/]+$/, '')} --code <code> --wait`;
}

function relayBaseUrl(relayRequestUrl: string): string {
  return relayRequestUrl.replace(/\/api\/requests\/[^/]+$/, '');
}

function operatorContinueCommand(request: SessionApprovalRequest | null): string {
  if (!request?.walletName || request.walletName === 'main') {
    return 'zk-agent next';
  }

  return `zk-agent next --wallet ${request.walletName}`;
}

function isSmartAccountRequest(request: SessionApprovalRequest | null): boolean {
  return request?.requestedAccountKind === 'smart-account';
}

function isApprovalBasedRequest(request: SessionApprovalRequest | null): boolean {
  return request?.requestedPaymasterMode === 'approval-based';
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
  const [relayStatus, setRelayStatus] = useState<RelayStatusResponse | null>(null);
  const [relayStatusError, setRelayStatusError] = useState('');
  const [isRelayRefreshing, setIsRelayRefreshing] = useState(false);
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
  const smartAccountRequest = isSmartAccountRequest(request);
  const approvalBasedRequest = isApprovalBasedRequest(request);

  useEffect(() => {
    let cancelled = false;

    async function loadRelayRequest(markRefreshing = false) {
      if (encodedRequest || !relayRequestUrl) return;

      if (markRefreshing && !cancelled) {
        setIsRelayRefreshing(true);
      }

      try {
        const response = await fetch(relayRequestUrl);
        const body = (await response.json()) as RelayStatusResponse | { error?: string };
        if (!response.ok) {
          throw new Error(
            'error' in body && body.error
              ? body.error
              : `Relay request fetch failed with status ${response.status}`
          );
        }

        if (!cancelled && hasRelayRequest(body)) {
          setRelayStatus(body);
          setRequest(body.request || null);
          setRelayStatusError('');
          setRequestLoadError(body.request ? '' : 'Relay request did not include an approval payload request.');
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : 'Failed to load relay request.';
          setRelayStatusError(message);
          setRequestLoadError(message);
        }
      } finally {
        if (!cancelled) {
          setIsRelayRefreshing(false);
        }
      }
    }

    void loadRelayRequest();

    if (!encodedRequest && relayRequestUrl) {
      const interval = window.setInterval(() => {
        if (cancelled) return;
        if (relayStatus?.approval_ready || relayStatus?.status === 'expired') return;
        void loadRelayRequest();
      }, 3000);

      return () => {
        cancelled = true;
        window.clearInterval(interval);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [encodedRequest, relayRequestUrl, relayStatus?.approval_ready, relayStatus?.status]);

  const derivedOwnerAddress = useMemo(() => {
    if (!sessionPrivateKey) return '';

    try {
      return deriveEthereumAddressFromPrivateKey(sessionPrivateKey);
    } catch {
      return '';
    }
  }, [sessionPrivateKey]);

  const payloadDraft = useMemo(() => {
    if (!request) {
      return {
        payload: null,
        error: 'Approval request is missing.'
      };
    }

    if (!walletAddress) {
      return {
        payload: null,
        error: 'walletAddress is required.'
      };
    }

    try {
      return {
        payload: buildApprovedSessionPayload({
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
        }),
        error: ''
      };
    } catch (error) {
      return {
        payload: null,
        error: error instanceof Error ? error.message : 'Failed to build approved session payload.'
      };
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
  const approvedPayload = payloadDraft.payload;
  const payloadError = payloadDraft.error;

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
  const relayBase = useMemo(
    () => (relayRequestUrl ? relayBaseUrl(relayRequestUrl) : ''),
    [relayRequestUrl]
  );
  const relayWaitCommand = useMemo(() => {
    if (!request || !relayBase) return '';
    return `zk-agent wallet request relay-status --request-id ${request.requestId} --relay-url ${relayBase} --wait`;
  }, [relayBase, request]);
  const encryptedFinalizeCommand = useMemo(() => {
    if (!request) {
      return 'zk-agent wallet request approve --request-id <id> --encrypted-payload @encrypted-session.json --code <code>';
    }

    return `zk-agent wallet request approve --request-id ${request.requestId} --encrypted-payload @encrypted-session.json --code ${encryptedRelayPackage?.code || '<code>'}`;
  }, [encryptedRelayPackage?.code, request]);
  const continueCommand = useMemo(() => operatorContinueCommand(request), [request]);
  const relayShareUrl = useMemo(() => relayShareUrlFromStatus(relayStatus), [relayStatus]);
  const relayStatusLabel = relayStatus
    ? relayStatus.status
    : relayRequestUrl
      ? isRelayRefreshing
        ? 'loading'
        : 'pending'
      : null;
  const relayStateTone = relayStatusLabel ? relayStatusTone(relayStatusLabel) : 'muted';
  const relayPrimaryMessage = relayStatus
    ? relayStatus.status === 'ready'
      ? 'Encrypted relay approval is ready. The CLI can finalize with the approval code now.'
      : relayStatus.status === 'expired'
        ? 'This relay request has expired. Create or reapprove a fresh session request.'
        : relayStatus.approval_ready
          ? 'Relay approval is ready.'
          : 'Waiting for the connector to submit the encrypted approval package.'
    : relayRequestUrl
      ? 'Loading relay approval status.'
      : '';

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
            {relayRequestUrl ? (
              <section className="panel">
                <div className="panel-header">
                  <h2>Relay approval status</h2>
                  <span className={`state-pill state-pill--${relayStateTone}`}>
                    {relayStatusLabel || 'idle'}
                  </span>
                </div>
                <p className="helper">{relayPrimaryMessage}</p>
                <dl className="meta compact-meta">
                  <div>
                    <dt>Approval ready</dt>
                    <dd>{relayStatus?.approval_ready ? 'yes' : 'no'}</dd>
                  </div>
                  <div>
                    <dt>Share URL</dt>
                    <dd>{relayShareUrl || 'n/a'}</dd>
                  </div>
                  <div>
                    <dt>Status URL</dt>
                    <dd>{relayRequestUrl}</dd>
                  </div>
                  <div>
                    <dt>Submitted at</dt>
                    <dd>{formatTimestamp(relayStatus?.approval_submitted_at)}</dd>
                  </div>
                  <div>
                    <dt>Expires</dt>
                    <dd>{formatTimestamp(relayStatus?.expires_at || request.expiresAt)}</dd>
                  </div>
                </dl>
                <div className="actions">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!relayRequestUrl || encodedRequest) return;

                      setIsRelayRefreshing(true);
                      try {
                        const response = await fetch(relayRequestUrl);
                        const body = (await response.json()) as RelayStatusResponse | { error?: string };
                        if (!response.ok) {
                          throw new Error(
                            'error' in body && body.error
                              ? body.error
                              : `Relay request fetch failed with status ${response.status}`
                          );
                        }
                        if (hasRelayRequest(body)) {
                          setRelayStatus(body);
                          setRelayStatusError('');
                          setRequest(body.request || request);
                        }
                      } catch (error) {
                        setRelayStatusError(
                          error instanceof Error ? error.message : 'Failed to refresh relay status.'
                        );
                      } finally {
                        setIsRelayRefreshing(false);
                      }
                    }}
                  >
                    {isRelayRefreshing ? 'Refreshing...' : 'Refresh relay status'}
                  </button>
                  <button
                    type="button"
                    disabled={!relayShareUrl}
                    onClick={async () => {
                      const ok = relayShareUrl ? await copyText(relayShareUrl) : false;
                      setCopyStatus(ok ? 'Relay share URL copied to clipboard.' : 'Clipboard copy failed.');
                    }}
                  >
                    Copy share URL
                  </button>
                  <button
                    type="button"
                    disabled={!relayRequestUrl}
                    onClick={async () => {
                      const ok = relayRequestUrl ? await copyText(relayRequestUrl) : false;
                      setCopyStatus(ok ? 'Relay status URL copied to clipboard.' : 'Clipboard copy failed.');
                    }}
                  >
                    Copy status URL
                  </button>
                </div>
                {relayStatusError ? <p className="status status-error">{relayStatusError}</p> : null}
              </section>
            ) : null}

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
              <div className="helper-stack">
                <p className="helper">
                  Required now:
                  {' '}
                  wallet address
                  {smartAccountRequest ? ', plus owner address or session private key' : ''}.
                  {approvalBasedRequest ? ' Approval-based paymaster mode also expects the fee token address.' : ''}
                </p>
                {derivedOwnerAddress ? (
                  <p className="status">
                    Derived owner from session private key:
                    {' '}
                    <code>{derivedOwnerAddress}</code>
                  </p>
                ) : null}
                {payloadError ? <p className="status status-error">{payloadError}</p> : null}
              </div>
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
                    placeholder={
                      smartAccountRequest
                        ? '0x... or leave empty if session private key can derive it'
                        : 'Optional 0x...'
                    }
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
                {smartAccountRequest ? (
                  <>
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
                  </>
                ) : null}
                <label>
                  <span>Paymaster address</span>
                  <input
                    value={paymasterAddress}
                    onChange={(event) => setPaymasterAddress(event.target.value.trim())}
                    placeholder="Optional 0x..."
                  />
                </label>
                {approvalBasedRequest ? (
                  <label>
                    <span>Paymaster token</span>
                    <input
                      value={paymasterToken}
                      onChange={(event) => setPaymasterToken(event.target.value.trim())}
                      placeholder="0x... fee token for approval-based mode"
                    />
                  </label>
                ) : null}
              </div>
              <p className="helper">
                {callbackUrl
                  ? 'Approve in the connector to return the session directly to the waiting CLI process. Copy payload remains available as a fallback.'
                  : relayRequestUrl
                    ? relayStatus?.status === 'expired'
                      ? 'This relay request is expired. Do not submit a new approval package here.'
                      : relayStatus?.approval_ready
                        ? `Relay already has an encrypted approval package. Finalize it from the CLI with \`${finalizeRelayCommand}\`.`
                        : `Approve here to submit the encrypted relay package, then finalize from the CLI with \`${finalizeRelayCommand}\`.`
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
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    setOwnerAddress('');
                    setSessionAddress('');
                    setSessionPrivateKey('');
                    setValidatorAddress('');
                    setPaymasterAddress('');
                    setPaymasterToken('');
                    setCopyStatus('');
                    setSubmitStatus('');
                  }}
                >
                  Clear optional fields
                </button>
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
                    disabled={!encryptedRelayPackage || isSubmitting || relayStatus?.status === 'expired'}
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

                        const refreshed = await fetch(relayRequestUrl);
                        const refreshedBody = (await refreshed.json().catch(() => null)) as
                          | RelayStatusResponse
                          | { error?: string }
                          | null;
                        if (refreshed.ok && refreshedBody && hasRelayRequest(refreshedBody)) {
                          setRelayStatus(refreshedBody);
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

            <section className="panel">
              <h2>Operator next steps</h2>
              {callbackUrl ? (
                <div className="helper-stack">
                  <p className="helper">
                    Preferred path: click
                    {' '}
                    <code>Approve In CLI</code>
                    {' '}
                    above. If the operator still has the local CLI waiting on this request, that path completes immediately.
                  </p>
                  <p className="helper">
                    If the local callback path is unavailable, finalize the copied JSON payload from the CLI:
                  </p>
                  <label className="field-stack">
                    <span>Fallback finalize command</span>
                    <textarea className="command-block" readOnly value={finalizeCommand} />
                  </label>
                  <label className="field-stack">
                    <span>After approval, continue with</span>
                    <textarea className="command-block" readOnly value={continueCommand} />
                  </label>
                  <div className="actions">
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyText(finalizeCommand);
                        setCopyStatus(ok ? 'Finalize command copied to clipboard.' : 'Clipboard copy failed.');
                      }}
                    >
                      Copy finalize command
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyText(continueCommand);
                        setCopyStatus(ok ? 'Continue command copied to clipboard.' : 'Clipboard copy failed.');
                      }}
                    >
                      Copy continue command
                    </button>
                  </div>
                </div>
              ) : relayRequestUrl ? (
                <div className="helper-stack">
                  {relayStatus?.status === 'expired' ? (
                    <p className="status status-error">
                      This relay request is expired. The operator should create or reapprove a fresh wallet request.
                    </p>
                  ) : (
                    <>
                      <p className="helper">
                        {relayStatus?.approval_ready
                          ? 'The relay already has the encrypted approval package. The CLI operator can finalize now.'
                          : 'After submitting the encrypted package, the CLI operator should wait for relay readiness and then finalize with the approval code.'}
                      </p>
                      <label className="field-stack">
                        <span>CLI wait command</span>
                        <textarea
                          className="command-block"
                          readOnly
                          value={relayWaitCommand || 'zk-agent wallet request relay-status --request-id <id> --relay-url <relay-url> --wait'}
                        />
                      </label>
                      <label className="field-stack">
                        <span>CLI finalize command</span>
                        <textarea
                          className="command-block"
                          readOnly
                          value={finalizeRelayCommand}
                        />
                      </label>
                      <label className="field-stack">
                        <span>After relay finalization, continue with</span>
                        <textarea className="command-block" readOnly value={continueCommand} />
                      </label>
                      <label className="field-stack">
                        <span>Approval code</span>
                        <input
                          readOnly
                          value={encryptedRelayPackage?.code || ''}
                          placeholder="Generated after valid approval data exists"
                        />
                      </label>
                      <div className="actions">
                        <button
                          type="button"
                          disabled={!relayWaitCommand}
                          onClick={async () => {
                            const ok = relayWaitCommand ? await copyText(relayWaitCommand) : false;
                            setCopyStatus(ok ? 'Relay wait command copied to clipboard.' : 'Clipboard copy failed.');
                          }}
                        >
                          Copy wait command
                        </button>
                        <button
                          type="button"
                          disabled={!finalizeRelayCommand}
                          onClick={async () => {
                            const ok = finalizeRelayCommand ? await copyText(finalizeRelayCommand) : false;
                            setCopyStatus(ok ? 'Relay finalize command copied to clipboard.' : 'Clipboard copy failed.');
                          }}
                        >
                          Copy finalize command
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await copyText(continueCommand);
                            setCopyStatus(ok ? 'Continue command copied to clipboard.' : 'Clipboard copy failed.');
                          }}
                        >
                          Copy continue command
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
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="helper-stack">
                  <p className="helper">
                    No direct callback is active. Save the generated payload or encrypted package, finalize it from the CLI, then continue with the normal operator path.
                  </p>
                  <label className="field-stack">
                    <span>Plain payload finalize command</span>
                    <textarea className="command-block" readOnly value={finalizeCommand} />
                  </label>
                  <label className="field-stack">
                    <span>Encrypted payload finalize command</span>
                    <textarea className="command-block" readOnly value={encryptedFinalizeCommand} />
                  </label>
                  <label className="field-stack">
                    <span>After approval, continue with</span>
                    <textarea className="command-block" readOnly value={continueCommand} />
                  </label>
                  <div className="actions">
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyText(finalizeCommand);
                        setCopyStatus(ok ? 'Plain finalize command copied to clipboard.' : 'Clipboard copy failed.');
                      }}
                    >
                      Copy plain finalize
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyText(encryptedFinalizeCommand);
                        setCopyStatus(ok ? 'Encrypted finalize command copied to clipboard.' : 'Clipboard copy failed.');
                      }}
                    >
                      Copy encrypted finalize
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyText(continueCommand);
                        setCopyStatus(ok ? 'Continue command copied to clipboard.' : 'Clipboard copy failed.');
                      }}
                    >
                      Copy continue command
                    </button>
                  </div>
                </div>
              )}
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
