/*
 * Copyright 2022 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useEffect, useState } from 'react';

import { useTheme } from '@material-ui/core';

import { BackstageTheme } from '@backstage/theme';
import { CompoundEntityRef } from '@backstage/catalog-model';
import { useAnalytics, useApi } from '@backstage/core-plugin-api';
import { scmIntegrationsApiRef } from '@backstage/integration-react';

import {
  techdocsStorageApiRef,
  useShadowDomStylesLoading,
} from '@backstage/plugin-techdocs-react';

import { useTechDocsReader } from '../TechDocsReaderProvider';

import {
  addBaseUrl,
  addGitFeedbackLink,
  addLinkClickListener,
  addSidebarToggle,
  onCssReady,
  removeMkdocsHeader,
  rewriteDocLinks,
  simplifyMkdocsFooter,
  scrollIntoAnchor,
  scrollIntoNavigation,
  transform as transformer,
  copyToClipboard,
  useSanitizerTransformer,
  useStylesTransformer,
} from '../../transformers';
import { useNavigateUrl } from './useNavigateUrl';

/**
 * Hook that encapsulates the behavior of getting raw HTML and applying
 * transforms to it in order to make it function at a basic level in the
 * Backstage UI.
 */
export const useTechDocsReaderDom = (
  entityRef: CompoundEntityRef,
): Element | null => {
  const navigate = useNavigateUrl();
  const theme = useTheme<BackstageTheme>();
  const sanitizerTransformer = useSanitizerTransformer();
  const stylesTransformer = useStylesTransformer();
  const analytics = useAnalytics();

  const techdocsStorageApi = useApi(techdocsStorageApiRef);
  const scmIntegrationsApi = useApi(scmIntegrationsApiRef);

  const { state, path, content: rawPage } = useTechDocsReader();

  const [dom, setDom] = useState<HTMLElement | null>(null);
  const isStyleLoading = useShadowDomStylesLoading(dom);

  // dynamically set width of footer to accommodate for pinning of the sidebar
  const updateFooterWidth = useCallback(() => {
    if (!dom) return;
    const footer = dom.querySelector<HTMLElement>('.md-footer');
    if (footer) {
      footer.style.width = `${dom.getBoundingClientRect().width}px`;
    }
  }, [dom]);

  useEffect(() => {
    window.addEventListener('resize', updateFooterWidth);
    return () => {
      window.removeEventListener('resize', updateFooterWidth);
    };
  }, [dom, updateFooterWidth]);

  // an update to "state" might lead to an updated UI so we include it as a trigger
  useEffect(() => {
    if (!isStyleLoading) {
      updateFooterWidth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isStyleLoading, updateFooterWidth]);

  // a function that performs transformations that are executed prior to adding it to the DOM
  const preRender = useCallback(
    (rawContent: string, contentPath: string) =>
      transformer(rawContent, [
        sanitizerTransformer,
        addBaseUrl({
          techdocsStorageApi,
          entityId: entityRef,
          path: contentPath,
        }),
        rewriteDocLinks(),
        addSidebarToggle(),
        removeMkdocsHeader(),
        simplifyMkdocsFooter(),
        addGitFeedbackLink(scmIntegrationsApi),
        stylesTransformer,
      ]),
    [
      // only add dependencies that are in state or memorized variables to avoid unnecessary calls between re-renders
      entityRef,
      scmIntegrationsApi,
      techdocsStorageApi,
      sanitizerTransformer,
      stylesTransformer,
    ],
  );

  // a function that performs transformations that are executed after adding it to the DOM
  const postRender = useCallback(
    async (transformedElement: Element) =>
      transformer(transformedElement, [
        scrollIntoAnchor(),
        scrollIntoNavigation(),
        copyToClipboard(theme),
        addLinkClickListener({
          baseUrl: window.location.origin,
          onClick: (event: MouseEvent, url: string) => {
            // detect if CTRL or META keys are pressed so that links can be opened in a new tab with `window.open`
            const modifierActive = event.ctrlKey || event.metaKey;
            const parsedUrl = new URL(url);

            // capture link clicks within documentation
            const linkText =
              (event.target as HTMLAnchorElement | undefined)?.innerText || url;
            const to = url.replace(window.location.origin, '');
            analytics.captureEvent('click', linkText, { attributes: { to } });

            // hash exists when anchor is clicked on secondary sidebar
            if (parsedUrl.hash) {
              if (modifierActive) {
                window.open(url, '_blank');
              } else {
                navigate(url);
                // Scroll to hash if it's on the current page
                transformedElement
                  ?.querySelector(`[id="${parsedUrl.hash.slice(1)}"]`)
                  ?.scrollIntoView();
              }
            } else {
              if (modifierActive) {
                window.open(url, '_blank');
              } else {
                navigate(url);
              }
            }
          },
        }),
        // disable MkDocs drawer toggling ('for' attribute => checkbox mechanism)
        onCssReady({
          onLoading: () => {},
          onLoaded: () => {
            transformedElement
              .querySelector('.md-nav__title')
              ?.removeAttribute('for');
          },
        }),
      ]),
    [theme, navigate, analytics],
  );

  useEffect(() => {
    if (!rawPage) return () => {};

    // if false, there is already a newer execution of this effect
    let shouldReplaceContent = true;

    // Pre-render
    preRender(rawPage, path).then(async preTransformedDomElement => {
      if (!preTransformedDomElement?.innerHTML) {
        return; // An unexpected error occurred
      }

      // don't manipulate the shadow dom if this isn't the latest effect execution
      if (!shouldReplaceContent) {
        return;
      }

      // Scroll to top after render
      window.scroll({ top: 0 });

      // Post-render
      const postTransformedDomElement = await postRender(
        preTransformedDomElement,
      );
      setDom(postTransformedDomElement as HTMLElement);
    });

    // cancel this execution
    return () => {
      shouldReplaceContent = false;
    };
  }, [rawPage, path, preRender, postRender]);

  return dom;
};
