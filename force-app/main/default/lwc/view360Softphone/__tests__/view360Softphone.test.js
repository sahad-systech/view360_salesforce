import { createElement } from '@lwc/engine-dom';
import View360Softphone from 'c/view360Softphone';

describe('c-view360-softphone', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('renders iframe with default hosted URL and accessible title', () => {
        const element = createElement('c-view360-softphone', {
            is: View360Softphone
        });
        document.body.appendChild(element);

        const iframe = element.shadowRoot.querySelector('iframe');
        expect(iframe).not.toBeNull();
        expect(iframe.src).toBe('https://syscare.systech.ae/v1/chat-app/view/v1/auth/login');
        expect(iframe.title).toBe('View360 Softphone');
    });

    it('displays loading spinner while iframe is loading', () => {
        const element = createElement('c-view360-softphone', {
            is: View360Softphone
        });
        document.body.appendChild(element);

        const spinner = element.shadowRoot.querySelector('lightning-spinner');
        expect(spinner).not.toBeNull();
    });

    it('hides spinner when iframe finishes loading', () => {
        const element = createElement('c-view360-softphone', {
            is: View360Softphone
        });
        document.body.appendChild(element);

        const iframe = element.shadowRoot.querySelector('iframe');
        iframe.dispatchEvent(new CustomEvent('load'));

        return Promise.resolve().then(() => {
            const spinner = element.shadowRoot.querySelector('lightning-spinner');
            expect(spinner).toBeNull();
        });
    });

    it('displays validation error if an insecure HTTP URL is provided', () => {
        const element = createElement('c-view360-softphone', {
            is: View360Softphone
        });
        element.softphoneUrl = 'http://insecure-domain.com/softphone';
        document.body.appendChild(element);

        return Promise.resolve().then(() => {
            const errorMessage = element.shadowRoot.querySelector('.error-message');
            expect(errorMessage).not.toBeNull();
            expect(errorMessage.textContent).toContain('Insecure URL');
            const iframe = element.shadowRoot.querySelector('iframe');
            expect(iframe).toBeNull();
        });
    });

    it('displays error if softphoneUrl is empty', () => {
        const element = createElement('c-view360-softphone', {
            is: View360Softphone
        });
        element.softphoneUrl = '';
        document.body.appendChild(element);

        return Promise.resolve().then(() => {
            const errorMessage = element.shadowRoot.querySelector('.error-message');
            expect(errorMessage).not.toBeNull();
            expect(errorMessage.textContent).toContain('Softphone URL is not configured');
            const iframe = element.shadowRoot.querySelector('iframe');
            expect(iframe).toBeNull();
        });
    });
});