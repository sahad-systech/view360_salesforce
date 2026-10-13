import { LightningElement, api } from 'lwc';

const DEFAULT_URL = 'https://syscare.systech.ae/v1/chat-app/view/v1/auth/login';

export default class View360Softphone extends LightningElement {
    @api softphoneUrl = DEFAULT_URL;
    isLoading = true;
    hasError = false;

    get isConfigured() {
        return Boolean(this.softphoneUrl && typeof this.softphoneUrl === 'string' && this.softphoneUrl.trim().length > 0);
    }

    get isSecureUrl() {
        if (!this.isConfigured) {
            return false;
        }
        const trimmed = this.softphoneUrl.trim().toLowerCase();
        return trimmed.startsWith('https://') || trimmed.startsWith('http://localhost') || trimmed.startsWith('http://127.0.0.1');
    }

    get hasInvalidUrl() {
        return this.isConfigured && !this.isSecureUrl;
    }

    get showSpinner() {
        return this.isLoading && this.isConfigured && this.isSecureUrl && !this.hasError;
    }

    get showError() {
        return !this.isConfigured || this.hasInvalidUrl || this.hasError;
    }

    get errorMessage() {
        if (!this.isConfigured) {
            return 'Softphone URL is not configured. Please set the Softphone URL in the Lightning App Manager Utility Bar item settings.';
        }
        if (this.hasInvalidUrl) {
            return 'Insecure URL detected. For Salesforce security compliance, the softphone URL must use HTTPS.';
        }
        return 'Failed to load the View360 softphone. Please verify your network connection, ensure the URL is active, and confirm that Salesforce origins are permitted in the application\'s CSP frame-ancestors settings.';
    }

    get showIframe() {
        return this.isConfigured && this.isSecureUrl && !this.hasError;
    }

    handleIframeLoad() {
        this.isLoading = false;
    }

    handleIframeError() {
        this.isLoading = false;
        this.hasError = true;
    }

    get iframeClass() {
        return this.isLoading ? 'hidden-iframe' : 'softphone-iframe';
    }
}