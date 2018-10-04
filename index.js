Ext.define('Utils.AncestorPiAppFilter', {
    alias: 'plugin.UtilsAncestorPiAppFilter',
    mixins: ['Ext.AbstractPlugin'],
    extend: 'Ext.Component',

    statics: {
        RENDER_AREA_ID: 'utils-ancestor-pi-app-filter'
    },

    portfolioItemTypes: [],
    readyDeferred: null,

    init: function(cmp) {
        this.cmp = cmp;
        this.readyDeferred = Ext.create('Deft.Deferred');
        this.cmp.getSettingsFields = _.compose(this.getSettingsFields, cmp.getSettingsFields);
        var appDefaults = this.cmp.defaultSettings;
        appDefaults['Utils.AncestorPiAppFilter.piType'] = null;
        this.cmp.setDefaultSettings(appDefaults);

        // Wait until app settings are ready before adding the control component
        this.cmp.on('beforelaunch', function() {
            this.addControlCmp();
        }, this);

        Rally.data.util.PortfolioItemHelper.getPortfolioItemTypes().then({
            scope: this,
            success: function(data) {
                this.portfolioItemTypes = data;
            }
        })
    },

    initComponent: function() {
        this.addEvents('ready', 'select');
    },

    getSettingsFields: function(fields) {
        return [{
            xtype: 'rallyportfolioitemtypecombobox',
            id: 'Utils.AncestorPiAppFilter.piType',
            name: 'Utils.AncestorPiAppFilter.piType',
            fieldLabel: 'Ancestor Portfolio Item Type',
            valueField: 'TypePath',
            allowNoEntry: true,
            // Needed to allow component to auto select '-- No Entry --' instead of lowest PI level
            defaultSelectionPosition: 'first'
        }].concat(fields || []);
    },

    getReadyPromise: function() {
        return this.readyDeferred.promise;
    },

    // Requires that app settings are available (e.g. from 'beforelaunch')
    addControlCmp: function() {
        if (this.isAncestorFilterEnabled()) {
            var selectedPiType = this.cmp.getSetting('Utils.AncestorPiAppFilter.piType');
            var renderArea = this.cmp.down('#' + Utils.AncestorPiAppFilter.RENDER_AREA_ID);
            if (renderArea) {
                this.piSelector = Ext.create('Rally.ui.combobox.ArtifactSearchComboBox', {
                    fieldLabel: "Ancestor Portfolio Item",
                    storeConfig: {
                        models: selectedPiType,
                        autoLoad: true
                    },
                    stateful: true,
                    stateId: this.cmp.getContext().getScopedStateId('Utils.AncestorPiAppFilter.piSelector'),
                    stateEvents: ['select'],
                    valueField: '_ref',
                    allowClear: true,
                    clearValue: null,
                    allowNoEntry: true,
                    noEntryValue: '',
                    defaultSelectionPosition: null,
                    listeners: {
                        scope: this,
                        select: function(cmp, records) {
                            this.fireEvent('select', this, records);
                        },
                        ready: function(cmp, records) {
                            this.readyDeferred.resolve();
                            this.fireEvent('ready', this, records);
                        }
                    }
                });
                // Allow this combobox to save null state (which is default behavior of
                // stateful mixin, but for some reason was overridden in combobox)
                Ext.override(this.piSelector, {
                    saveState: function() {
                        var me = this,
                            id = me.stateful && me.getStateId(),
                            hasListeners = me.hasListeners,
                            state;

                        if (id) {
                            state = me.getState() || {}; //pass along for custom interactions
                            if (!hasListeners.beforestatesave || me.fireEvent('beforestatesave', me, state) !== false) {
                                Ext.state.Manager.set(id, state);
                                if (hasListeners.statesave) {
                                    me.fireEvent('statesave', me, state);
                                }
                            }
                        }
                    }
                })
                renderArea.add(this.piSelector);
            }
        }
    },

    isAncestorFilterEnabled: function() {
        var piType = this.cmp.getSetting('Utils.AncestorPiAppFilter.piType');
        return piType && piType != ''
    },

    getFilterForType: function(type) {
        var filter;
        var modelName = type.toLowerCase();

        if (this.isAncestorFilterEnabled() && this._hasPiAncestor(modelName)) {
            var selectedRecord = this.piSelector.getRecord();
            var selectedPi = this.piSelector.getValue()
            if (selectedRecord && selectedPi != null) {
                var pisAbove = this._pisAbove(modelName);
                var selectedPiTypePath = this.cmp.getSetting('Utils.AncestorPiAppFilter.piType');
                var property = this.propertyPrefix(modelName, selectedPiTypePath, pisAbove);
                if (property) {
                    filter = new Rally.data.wsapi.Filter({
                        property: property,
                        value: selectedPi
                    });

                }
            }
        }

        return filter
    },

    propertyPrefix: function(typeName, selectedPiTypePath, piTypesAbove) {
        var property;
        if (typeName === 'hierarchicalrequirement' || typeName === 'userstory') {
            property = 'PortfolioItem';
        }
        else if (typeName === 'defect') {
            property = 'Requirement.PortfolioItem';
        }
        else if (typeName.startsWith('portfolioitem')) {
            property = 'Parent';
        }

        if (property) {
            _.forEach(piTypesAbove, function(piType) {
                if (piType.get('TypePath') == selectedPiTypePath) {
                    return false;
                }
                else {
                    property = property + '.Parent'
                }
            }, this);
        }

        return property;
    },

    _hasPiAncestor: function(modelName) {
        return _.contains(['hierarchicalrequirement', 'userstory', 'defect'], modelName) || modelName.startsWith('portfolioitem');
    },

    _pisAbove: function(modelName) {
        var result = [];
        if (_.contains(['hierarchicalrequirement', 'userstory', 'defect'], modelName)) {
            result = this.portfolioItemTypes
        }
        else if (modelName.startsWith('portfolioitem')) {
            var startIndex = _.findIndex(this.portfolioItemTypes, function(piType) {
                return piType.get('TypePath') === modelName;
            });
            if (startIndex >= 0 && startIndex < this.portfolioItemTypes.length - 1) {
                result = this.portfolioItemTypes.slice(startIndex + 1);
            }
        }
        return result;
    },
});
