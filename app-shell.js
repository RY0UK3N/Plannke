/* Plannke canonical desktop shell and visual asset loader. */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.PlannkeShell = api;

    if (typeof document !== 'undefined') {
        const start = () => {
            api.primeCanonicalShell();
            api.loadRevampAssets();
        };
        if (document.body) start();
        else document.addEventListener('DOMContentLoaded', start, { once: true });
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';

    const CANONICAL_PAGES = [
        ['dashboard', 'ph-house', 'Início'],
        ['movimentacao', 'ph-arrows-left-right', 'Movimentações'],
        ['projecao', 'ph-target', 'Planejamento'],
        ['accounts', 'ph-wallet', 'Contas e cartões'],
        ['backup', 'ph-database', 'Dados']
    ];

    function make(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = String(text);
        return node;
    }

    function icon(name) {
        return make('i', `ph ${name}`);
    }

    function canonicalStylesPresent() {
        if (typeof document === 'undefined') return false;
        return !!document.querySelector('link[href="product.css"], link[href$="/product.css"]');
    }

    function primeCanonicalShell() {
        if (typeof document === 'undefined' || !document.body) return null;

        const existing = document.getElementById('revamp-shell');
        if (existing) {
            document.body.classList.add('plannke-revamp');
            document.body.dataset.revampVersion = '2';
            document.body.dataset.plannkeCanonical = 'desktop';
            return existing;
        }

        const main = document.querySelector('body > main');
        if (!main || !main.parentNode) return null;

        const shell = make('div', 'revamp-shell');
        shell.id = 'revamp-shell';

        const sidebar = make('aside', 'revamp-sidebar');
        sidebar.id = 'revamp-sidebar';

        const brand = make('div', 'revamp-brand');
        const brandCopy = make('div', 'revamp-brand-copy');
        brandCopy.append(make('strong', '', 'Plannke'), make('span', '', 'Central financeira'));
        brand.append(make('div', 'revamp-brand-mark', 'P'), brandCopy);

        const nav = make('nav', 'revamp-nav');
        nav.setAttribute('aria-label', 'Navegação principal');
        CANONICAL_PAGES.forEach(([target, iconName, label], index) => {
            const button = make('button', `revamp-nav-item${index === 0 ? ' active' : ''}`);
            button.type = 'button';
            button.dataset.target = target;
            button.setAttribute('aria-label', label);
            button.setAttribute('aria-current', index === 0 ? 'page' : 'false');
            button.append(icon(iconName), make('span', 'revamp-nav-label', label));
            nav.appendChild(button);
        });

        const spacer = make('div', 'revamp-sidebar-spacer');
        const localStatus = make('div', 'revamp-local-status');
        localStatus.title = 'As alterações são salvas automaticamente neste dispositivo.';
        localStatus.append(icon('ph-shield-check'), make('span', '', 'Salvo localmente'));

        const settings = make('button', 'revamp-settings');
        settings.type = 'button';
        settings.addEventListener('click', () => root.openSettingsPanel?.());
        settings.setAttribute('aria-label', 'Configurações');
        settings.append(icon('ph-gear'), make('span', '', 'Configurações'));
        sidebar.append(brand, nav, spacer, localStatus, settings);

        const content = make('div', 'revamp-content');
        content.id = 'revamp-content';
        const topbar = make('header', 'revamp-topbar');
        topbar.id = 'revamp-topbar';

        const topbarCopy = make('div', 'revamp-topbar-copy');
        const eyebrow = make('span', 'revamp-page-eyebrow', 'Visão financeira');
        eyebrow.id = 'revamp-page-eyebrow';
        const title = make('h1', 'revamp-page-title', 'Seu dinheiro, com contexto');
        title.id = 'revamp-page-title';
        const subtitle = make('p', 'revamp-page-subtitle', 'Saldo, compromissos e próximos passos em uma única visão.');
        subtitle.id = 'revamp-page-subtitle';
        topbarCopy.append(eyebrow, title, subtitle);

        const actions = make('div', 'revamp-topbar-actions');
        const add = make('button', 'revamp-primary-action');
        add.type = 'button';
        add.addEventListener('click', () => root.openTxModal?.(null));
        add.append(icon('ph-plus'), make('span', '', 'Nova movimentação'));
        actions.appendChild(add);
        topbar.append(topbarCopy, actions);

        const parent = main.parentNode;
        parent.insertBefore(shell, main);
        shell.append(sidebar, content);
        content.append(topbar, main);

        document.body.classList.add('plannke-revamp');
        document.body.dataset.revampVersion = '2';
        document.body.dataset.plannkeCanonical = 'desktop';
        return shell;
    }

    function loadDesktopAssets() {
        if (typeof document === 'undefined') return;
        if (!canonicalStylesPresent() && !document.querySelector('link[data-plannke-desktop-style]')) {
            const desktopStyle = document.createElement('link');
            desktopStyle.rel = 'stylesheet';
            desktopStyle.href = 'revamp-desktop.css';
            desktopStyle.dataset.plannkeDesktopStyle = 'true';
            document.head.appendChild(desktopStyle);
        }
        if (!document.querySelector('script[data-plannke-desktop]')) {
            const desktopScript = document.createElement('script');
            desktopScript.src = 'revamp-desktop.js';
            desktopScript.async = false;
            desktopScript.dataset.plannkeDesktop = 'true';
            document.body.appendChild(desktopScript);
        }
    }

    function loadRevampAssets() {
        if (typeof document === 'undefined') return;
        if (!canonicalStylesPresent() && !document.querySelector('link[data-plannke-revamp]')) {
            const stylesheet = document.createElement('link');
            stylesheet.rel = 'stylesheet';
            stylesheet.href = 'revamp.css';
            stylesheet.dataset.plannkeRevamp = 'desktop';
            document.head.appendChild(stylesheet);
        }

        let script = document.querySelector('script[data-plannke-revamp]');
        if (script) {
            if (root.PlannkePresentation) loadDesktopAssets();
            else script.addEventListener('load', loadDesktopAssets, { once: true });
            return;
        }

        script = document.createElement('script');
        script.src = 'app-presentation.js';
        script.async = false;
        script.dataset.plannkeRevamp = 'desktop';
        script.addEventListener('load', loadDesktopAssets, { once: true });
        document.body.appendChild(script);
    }

    return {
        CANONICAL_PAGES,
        primeCanonicalShell,
        loadDesktopAssets,
        loadRevampAssets
    };
});
