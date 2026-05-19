import { Unpromise } from "@watchable/unpromise";
import {
  loadLoadCardHelpers,
  hass_base_el,
} from "../helpers";
import { BrowserModPopup } from "./popup-dialog";

export const PopupMixin = (SuperClass) => {
  return class PopupMixinClass extends SuperClass {
    private _popupElements: BrowserModPopup[] = [];

    constructor() {
      super();

      loadLoadCardHelpers();

      this.addEventListener("browser-mod-popup-opened", this.popupStateListener);
      this.addEventListener("browser-mod-popup-closed", this.popupStateListener);      
      this._popupState = false;
    }

    get openPopups(): string[] {
      return this._popupElements
        .filter((popup) => popup.open === true)
        .map((popup) => popup.tag !== undefined ? popup.tag : "standard");
    }

    get popupState() {
      return this._popupElements.some((popup) => popup.open === true);
    }

    private popupStateListener = (ev: CustomEvent) => {
      const popup = ev.detail?.popup;
      if (ev.type === "browser-mod-popup-closed" && this._popupElements.includes(popup)) {
        this._popupElements = this._popupElements.filter(
          (p) => p !== popup
        );
      }
      if (ev.type === "browser-mod-popup-opened") {
        this._popupElements.push(popup);
      }
    };

    showPopup(params: BrowserModPopupParams) {
      (async () => {
        const base: any = await hass_base_el();
        // Close any existing popup with the same tag to allow open to work
        await this.closePopup({ tag: params.tag ?? "" });
        const dialogTag = params.tag ? 
          `browser-mod-popup-${params.tag}` : "browser-mod-popup";
        showBrowserModPopup(base, dialogTag, params);
      })();
    }

    async closePopup(args) {
      const _closePopup = async (popup) => {
        const tag = popup.tag !== undefined && popup.tag !== "" ? popup.tag : "standard";
        var timeoutId: ReturnType<typeof setTimeout> | undefined;
        const result = await Unpromise.race([
          new Promise<void>((resolve) => {
            timeoutId = setTimeout(() => {
              console.warn(`Browser Mod: Popup with tag "${tag}" did not close within timeout period`);
              resolve();
            }, 5000);
          }),
          new Promise<void>(async (resolve) => {
            const onClose = () => {
              this.removeEventListener('browser-mod-popup-closed', onClose);
              if (timeoutId !== undefined) clearTimeout(timeoutId);
              resolve();
            }
            this.addEventListener('browser-mod-popup-closed', onClose, { once: true });
            popup.closeDialog();
          })
        ]);
      }

      const { all, tag } = args;
      if (all === true) {
        await Promise.all(this._popupElements.map((popup) => _closePopup(popup)));
        this._popupElements = [];
      } else if (typeof tag === "string") {
        const dialogTag =
          tag != "" ?
            `browser-mod-popup-${tag}` :
            "browser-mod-popup";
        const popup = this._popupElements.find(
          (p) => p.nodeName.toLowerCase() === dialogTag
        );
        // Wait for the popup's dialog to close before proceeding
        if (popup?.dialog) {
          await _closePopup(popup);
        }
      } else {
        const popup = this._popupElements.pop();
        // Wait for the popup's dialog to close before proceeding
        if (popup?.dialog) {
            await _closePopup(popup);
        }
      }
    }

    async showMoreInfo(entityId, view = "info", large = false, ignore_popup_card = undefined, close = false) {
      const base = await hass_base_el();
      if (close) {
        // Provide a close option as the empty entity id method can cause issues
        // with camera stream audio tracks staying active
        const dialog: any = base.shadowRoot.querySelector(
          "ha-more-info-dialog"
        );
        if (dialog) dialog.closeDialog();
        return;
      }
      base.dispatchEvent(
        new CustomEvent("hass-more-info", {
          bubbles: true,
          composed: true,
          cancelable: false,
          detail: { entityId, view, ignore_popup_card },
        })
      );
      if (large) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const dialog: any = base.shadowRoot.querySelector(
          "ha-more-info-dialog"
        );
        if (dialog) dialog.large = true;
      }
    }

    setPopupStyle(args) {
      const { all, tag, style, direction } = args;
      if (all === true) {
        this._popupElements.forEach((popup) => {
          style ? popup._setStyleAttribute(style) : popup._cycleStyleAttributes(direction);
        });
      } else if (typeof tag === "string") {
        const dialogTag =
          tag != "" ?
            `browser-mod-popup-${tag}` :
            "browser-mod-popup";
        const popup = this._popupElements.find(
          (p) => p.nodeName.toLowerCase() === dialogTag
        );
        style ? popup?._setStyleAttribute(style) : popup?._cycleStyleAttributes(direction);
      } else {
        const popup = this._popupElements.slice(-1)[0];
        style ? popup?._setStyleAttribute(style) : popup?._cycleStyleAttributes(direction);
      }
    }
  };
};

export interface BrowserModPopupParams {
  title: string;
  content?: any;
  [key: string]: any;
}

const customElementClassCache: Record<string, typeof BrowserModPopup> = {};
const IFRAME_TYPE = "iframe";

function isIframeType(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase() === IFRAME_TYPE;
}

function popupContentContainsIframe(content: unknown): boolean {
  if (content == null || content === false) return false;
  if (content instanceof HTMLElement) {
    if (isIframeType(content.tagName)) {
      return true;
    }
    for (const child of content.children) {
      if (popupContentContainsIframe(child)) {
        return true;
      }
    }
    return false;
  }
  if (typeof content === "string") {
    return /<iframe[\s>]/i.test(content);
  }
  if (Array.isArray(content)) {
    return content.some((item) => popupContentContainsIframe(item));
  }
  if (typeof content === "object" && !Array.isArray(content)) {
    const objectContent = content as Record<string, unknown>;
    if (isIframeType(objectContent.type)) {
      return true;
    }
    for (const key of Object.keys(objectContent)) {
      if (key === "type") continue;
      if (popupContentContainsIframe(objectContent[key])) {
        return true;
      }
    }
  }
  return false;
}

export function setCustomElementClass(dialogTag: string): void {
  if (customElementClassCache[dialogTag]) {
    return;
  }

  // Dynamically create a new class extending BrowserModPopup
  class DynamicPopup extends BrowserModPopup {}

  // Register the custom element if not already defined
  if (!customElements.get(dialogTag)) {
    customElements.define(dialogTag, DynamicPopup);
  }

  customElementClassCache[dialogTag] = DynamicPopup;
}

export const showBrowserModPopup = (
  element: HTMLElement,
  dialogTag: string,
  BrowserModPopupParams: BrowserModPopupParams
): void => {
  setCustomElementClass(dialogTag);
  const addHistory = !popupContentContainsIframe(BrowserModPopupParams.content);
  element.dispatchEvent(
    new CustomEvent("show-dialog", {
      detail: {
        dialogTag,
        dialogImport: () => { return customElements.whenDefined(dialogTag) },
        dialogParams: BrowserModPopupParams,
        addHistory,
      }
    })
  );
};
