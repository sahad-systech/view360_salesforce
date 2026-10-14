import { LightningElement, api, wire, track } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import {
  subscribe,
  unsubscribe,
  MessageContext
} from "lightning/messageService";
import VIEW360_DIALER_CHANNEL from "@salesforce/messageChannel/View360DialerChannel__c";
import { createRecord } from "lightning/uiRecordApi";
import { ShowToastEvent } from "lightning/platformShowToastEvent";

const DEFAULT_URL = "https://syscare.systech.ae/v1/auth/login";

const ALLOWED_MESSAGE_TYPES = new Set([
  "call_event",
  "screen_pop",
  "new_contact",
  "event_popup",
  "close_popup",
  "customerprofile",
  "onclicktoact",
  "click_to_call"
]);

export default class View360Softphone extends NavigationMixin(
  LightningElement
) {
  @api softphoneUrl = DEFAULT_URL;

  @track isLoading = true;
  @track hasError = false;

  // Call tracking state
  @track isCallActive = false;
  @track callState = "Idle"; // 'Ringing', 'Connected', 'Ended'
  @track callDirection = "Inbound";
  @track currentPhone = "";
  @track currentCallerName = "";
  @track currentChannelCallId = "";
  @track currentWhoId = null;
  @track callDurationSeconds = 0;
  @track showCallBanner = false;
  @track showLogDrawer = false;

  // Call Log drawer fields
  @track logDisposition = "Completed";
  @track logNotes = "";
  @track isLogging = false;
  @track logErrorMessage = "";
  @track lastCallSummary = {};

  // In-memory set of logged CallObject IDs to prevent duplicates
  loggedCallObjects = new Set();

  callTimerInterval = null;
  callStartTime = null;
  dialSubscription = null;
  boundMessageHandler = null;

  @wire(MessageContext)
  messageContext;

  dispositionOptions = [
    { label: "Connected / Completed", value: "Completed" },
    { label: "Interested / Follow-up", value: "Interested" },
    { label: "Left Voicemail", value: "Left Voicemail" },
    { label: "Busy", value: "Busy" },
    { label: "No Answer", value: "No Answer" },
    { label: "Wrong Number", value: "Wrong Number" }
  ];

  connectedCallback() {
    this.boundMessageHandler = this.handleWindowMessage.bind(this);
    window.addEventListener("message", this.boundMessageHandler);

    this.dialSubscription = subscribe(
      this.messageContext,
      VIEW360_DIALER_CHANNEL,
      (message) => this.handleDialMessage(message)
    );
  }

  disconnectedCallback() {
    if (this.boundMessageHandler) {
      window.removeEventListener("message", this.boundMessageHandler);
      this.boundMessageHandler = null;
    }
    if (this.dialSubscription) {
      unsubscribe(this.dialSubscription);
      this.dialSubscription = null;
    }
    this.stopCallDurationTimer();
  }

  get isConfigured() {
    return Boolean(
      this.softphoneUrl &&
      typeof this.softphoneUrl === "string" &&
      this.softphoneUrl.trim().length > 0
    );
  }

  get isSecureUrl() {
    if (!this.isConfigured) return false;
    const trimmed = this.softphoneUrl.trim().toLowerCase();
    return (
      trimmed.startsWith("https://") ||
      trimmed.startsWith("http://localhost") ||
      trimmed.startsWith("http://127.0.0.1")
    );
  }

  get hasInvalidUrl() {
    return this.isConfigured && !this.isSecureUrl;
  }

  get allowedOrigin() {
    if (!this.isSecureUrl) return null;
    try {
      return new URL(this.softphoneUrl.trim()).origin;
    } catch {
      return null;
    }
  }

  get showSpinner() {
    return (
      this.isLoading && this.isConfigured && this.isSecureUrl && !this.hasError
    );
  }

  get showError() {
    return !this.isConfigured || this.hasInvalidUrl || this.hasError;
  }

  get errorMessage() {
    if (!this.isConfigured) {
      return "Softphone URL is not configured. Please set the Softphone URL in the Lightning App Manager Utility Bar item settings.";
    }
    if (this.hasInvalidUrl) {
      return "Insecure URL detected. For Salesforce security compliance, the softphone URL must use HTTPS.";
    }
    return "Failed to load the View360 softphone. Please verify your network connection, ensure the URL is active, and confirm that Salesforce origins are permitted in the application's CSP frame-ancestors settings.";
  }

  get showIframe() {
    return this.isConfigured && this.isSecureUrl && !this.hasError;
  }

  get iframeClass() {
    return this.isLoading ? "hidden-iframe" : "softphone-iframe";
  }

  get callBannerClass() {
    return this.callState === "Connected"
      ? "call-banner-connected"
      : "call-banner-incoming";
  }

  get callStatusBadgeText() {
    if (this.callState === "Connected") return "In Call (Connected)";
    if (this.callDirection === "Outbound") return "Dialing Outbound";
    return "Incoming Call";
  }

  get displayCallerName() {
    return (
      this.currentCallerName ||
      (this.callDirection === "Outbound" ? "Outbound Call" : "Incoming Caller")
    );
  }

  get displayCallerPhone() {
    return this.currentPhone || "Unknown Number";
  }

  get callDurationDisplay() {
    const minutes = Math.floor(this.callDurationSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (this.callDurationSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  get saveButtonLabel() {
    return this.isLogging ? "Saving..." : "Save Call Log";
  }

  handleIframeLoad() {
    this.isLoading = false;
  }

  handleIframeError() {
    this.isLoading = false;
    this.hasError = true;
  }

  // ==========================================
  // SECURE POSTMESSAGE COMMUNICATION
  // ==========================================
  handleWindowMessage(event) {
    // 1. Strict Origin Validation
    if (!this.allowedOrigin || event.origin !== this.allowedOrigin) {
      return;
    }

    // 2. Validate sender matches iframe window if available
    const iframe = this.template.querySelector("iframe");
    if (
      iframe &&
      iframe.contentWindow &&
      event.source !== iframe.contentWindow
    ) {
      return;
    }

    // 3. Payload and message type validation
    let rawData = event.data;
    if (typeof rawData === "string") {
      try {
        rawData = JSON.parse(rawData);
      } catch {
        // Ignore malformed string payloads
        return;
      }
    }

    if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
      return;
    }

    const type = rawData.type ? String(rawData.type).trim().toLowerCase() : "";
    if (!ALLOWED_MESSAGE_TYPES.has(type)) {
      return;
    }

    const payload =
      rawData.payload &&
      typeof rawData.payload === "object" &&
      !Array.isArray(rawData.payload)
        ? rawData.payload
        : rawData.data &&
            typeof rawData.data === "object" &&
            !Array.isArray(rawData.data)
          ? rawData.data
          : {};

    switch (type) {
      case "call_event":
        this.handleIncomingCallEvent(payload);
        break;
      case "screen_pop":
        this.handleScreenPopEvent(payload);
        break;
      case "event_popup":
        this.handleCallAnsweredEvent(payload);
        break;
      case "close_popup":
        this.handleCallEndedEvent(payload);
        break;
      case "customerprofile":
        if (payload.customerId) {
          this.screenPopSearch(String(payload.customerId));
        }
        break;
      default:
        break;
    }
  }

  postToSoftphone(message) {
    const iframe = this.template.querySelector("iframe");
    if (!iframe || !iframe.contentWindow) {
      console.warn("[View360] Cannot post to softphone: iframe not ready");
      return;
    }
    if (!this.allowedOrigin || this.allowedOrigin === "null") {
      console.warn("[View360] Cannot post to softphone: invalid allowedOrigin");
      return;
    }
    // Strict targetOrigin enforcement
    iframe.contentWindow.postMessage(message, this.allowedOrigin);
  }

  // ==========================================
  // CLICK-TO-DIAL (LMS & OPEN CTI)
  // ==========================================
  handleDialMessage(message) {
    if (!message || !message.phoneNumber) return;

    const phone = String(message.phoneNumber).trim();
    if (!phone) return;

    this.currentPhone = phone;
    this.currentCallerName = message.recordName || "";
    this.currentWhoId = message.recordId || null;
    this.callDirection = "Outbound";
    this.currentChannelCallId = `OUT-${Date.now()}`;
    this.callState = "Ringing";
    this.isCallActive = true;
    this.showCallBanner = true;
    this.showLogDrawer = false;
    this.startCallDurationTimer();

    // Send exact View360 click_to_call format
    this.postToSoftphone({
      type: "click_to_call",
      payload: {
        phone: phone,
        recordId: message.recordId,
        recordName: message.recordName
      }
    });
  }

  // ==========================================
  // INCOMING-CALL SCREEN POPS
  // ==========================================
  handleIncomingCallEvent(payload) {
    const phone = payload.phone || payload.callerId || "";
    this.currentPhone = String(phone).trim();
    this.currentCallerName = payload.customerName || payload.callerId || "";
    this.currentChannelCallId = payload.channelCallId
      ? String(payload.channelCallId)
      : `CALL-${Date.now()}`;
    this.callDirection = "Inbound";
    this.callState = "Ringing";
    this.isCallActive = true;
    this.showCallBanner = true;
    this.showLogDrawer = false;
    this.startCallDurationTimer();

    // Direct CRM match if provided by View360 payload
    const directId =
      payload.lead_id ||
      payload.customer ||
      payload.contact ||
      payload.customerId;
    if (directId && this.isValidSalesforceId(directId)) {
      this.currentWhoId = directId;
      this.navigateToRecord(directId);
      return;
    }

    // Automatic Screen Pop via phone search
    if (this.currentPhone) {
      this.screenPopSearch(this.currentPhone);
    }
  }

  handleScreenPopEvent(payload) {
    const directId =
      payload.lead_id ||
      payload.contact ||
      payload.customer ||
      payload.customerId;
    if (directId && this.isValidSalesforceId(directId)) {
      this.currentWhoId = directId;
      this.navigateToRecord(directId);
      return;
    }
    if (payload.phone) {
      this.screenPopSearch(payload.phone);
    }
  }

  handleCallAnsweredEvent(payload) {
    this.callState = "Connected";
    if (payload && payload.channelCallId) {
      this.currentChannelCallId = String(payload.channelCallId);
    }
  }

  handleCallEndedEvent(payload) {
    this.stopCallDurationTimer();
    this.isCallActive = false;
    this.showCallBanner = false;

    const finalDuration = this.callDurationSeconds;
    const channelId =
      payload && payload.channelCallId
        ? String(payload.channelCallId)
        : this.currentChannelCallId;

    this.lastCallSummary = {
      channelCallId: channelId,
      phone: this.currentPhone,
      callerName: this.currentCallerName,
      direction: this.callDirection,
      durationSeconds: finalDuration,
      durationFormatted: this.callDurationDisplay,
      whoId: this.currentWhoId
    };

    // Reset inputs and display call logging drawer
    this.logDisposition = "Completed";
    this.logNotes = "";
    this.logErrorMessage = "";
    this.showLogDrawer = true;
  }

  screenPopSearch(searchTerm) {
    if (!searchTerm || typeof searchTerm !== "string") return;
    const cleaned = searchTerm.replace(/[^0-9]/g, "");
    const queryTerm = cleaned.length >= 7 ? cleaned.slice(-7) : searchTerm;

    this[NavigationMixin.Navigate]({
      type: "standard__search",
      state: {
        term: queryTerm
      }
    });
  }

  navigateToRecord(recordId) {
    this[NavigationMixin.Navigate]({
      type: "standard__recordPage",
      attributes: {
        recordId: recordId,
        actionName: "view"
      }
    });
  }

  handleManualScreenPop() {
    if (this.currentPhone) {
      this.screenPopSearch(this.currentPhone);
    }
  }

  handleCreateRecordSelect(event) {
    const objectType = event.detail.value;
    const defaultValues = {
      Phone: this.currentPhone,
      MobilePhone: this.currentPhone
    };

    this[NavigationMixin.Navigate]({
      type: "standard__objectPage",
      attributes: {
        objectApiName: objectType,
        actionName: "new"
      },
      state: {
        defaultFieldValues: JSON.stringify(defaultValues)
      }
    });
  }

  isValidSalesforceId(idStr) {
    if (typeof idStr !== "string") return false;
    const trimmed = idStr.trim();
    return (
      (trimmed.length === 15 || trimmed.length === 18) &&
      (trimmed.startsWith("003") || trimmed.startsWith("00Q"))
    );
  }

  // ==========================================
  // CALL LOGGING TO SALESFORCE TASKS
  // ==========================================
  handleDispositionChange(event) {
    this.logDisposition = event.detail.value;
  }

  handleNotesChange(event) {
    this.logNotes = event.detail.value;
  }

  handleDismissLogDrawer() {
    this.showLogDrawer = false;
  }

  async handleSaveCallLog() {
    const summary = this.lastCallSummary;
    const callObjectKey = summary.channelCallId || `CALL-${Date.now()}`;

    // De-duplication check: prevent multiple tasks for the same call
    if (this.loggedCallObjects.has(callObjectKey)) {
      this.logErrorMessage = "This call has already been logged to Salesforce.";
      return;
    }

    this.isLogging = true;
    this.logErrorMessage = "";

    const taskFields = {
      TaskSubtype: "Call",
      CallType: summary.direction === "Outbound" ? "Outbound" : "Inbound",
      CallDurationInSeconds: summary.durationSeconds || 0,
      CallDisposition: this.logDisposition || "Completed",
      CallObject: callObjectKey,
      Subject: `Call: ${summary.direction} - ${summary.callerName || summary.phone || "Unknown"}`,
      Status: "Completed",
      Priority: "Normal",
      ActivityDate: new Date().toISOString().slice(0, 10),
      Description: this.logNotes ? this.logNotes.trim() : ""
    };

    if (summary.whoId && this.isValidSalesforceId(summary.whoId)) {
      taskFields.WhoId = summary.whoId;
    }

    try {
      const result = await createRecord({
        apiName: "Task",
        fields: taskFields
      });

      this.loggedCallObjects.add(callObjectKey);
      this.showLogDrawer = false;

      this.dispatchEvent(
        new ShowToastEvent({
          title: "Call Logged",
          message: `Call activity logged successfully (Task ID: ${result.id}).`,
          variant: "success"
        })
      );
    } catch (error) {
      console.error("[View360] Error logging call task:", error);
      const msg = error.body
        ? error.body.message
        : error.message || "Error creating Task record.";
      this.logErrorMessage = msg;
    } finally {
      this.isLogging = false;
    }
  }

  // ==========================================
  // CALL DURATION TIMER
  // ==========================================
  startCallDurationTimer() {
    this.stopCallDurationTimer();
    this.callDurationSeconds = 0;
    this.callStartTime = Date.now();

    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.callTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
      this.callDurationSeconds = elapsed;
    }, 1000);
  }

  stopCallDurationTimer() {
    if (this.callTimerInterval) {
      clearInterval(this.callTimerInterval);
      this.callTimerInterval = null;
    }
  }
}
