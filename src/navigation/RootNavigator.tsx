import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { HomeScreen } from '../screens/HomeScreen';
import { StockScreen } from '../screens/StockScreen';
import { PieceDetailScreen } from '../screens/PieceDetailScreen';
import { AddPieceScreen } from '../screens/AddPieceScreen';
import { StockIntakeScreen } from '../screens/StockIntakeScreen';
import { LogSaleScreen } from '../screens/LogSaleScreen';
import { PurchasesScreen } from '../screens/PurchasesScreen';
import { BalancesScreen } from '../screens/BalancesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { InsightsScreen } from '../screens/InsightsScreen';
import { CustomOrdersScreen } from '../screens/CustomOrdersScreen';
import { ReservationsScreen } from '../screens/ReservationsScreen';
import { SocialScreen } from '../screens/SocialScreen';
import { useTheme } from '../theme/ThemeContext';
import type { Colors } from '../theme/palettes';
import { ROUTE_ICONS, type IconName } from '../theme/icons';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function getNavTheme(colors: Colors): Theme {
  return {
    ...DefaultTheme,
    colors: { ...DefaultTheme.colors, background: colors.background, card: colors.surface, border: colors.border, text: colors.ink, primary: colors.ink },
  };
}

function ScreenTitle({ icon, title }: { icon: IconName; title: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.titleRow}>
      <Ionicons name={icon} size={17} color={colors.ink} />
      <Text style={styles.titleText}>{title}</Text>
    </View>
  );
}

export function RootNavigator() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navTheme = useMemo(() => getNavTheme(colors), [colors]);
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerShadowVisible: false,
          headerTintColor: colors.ink,
          headerTitleStyle: { fontWeight: '700', fontSize: 17, color: colors.ink },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen
          name="Stock"
          component={StockScreen}
          options={{ title: t('stock.title'), headerTitle: () => <ScreenTitle icon={ROUTE_ICONS.Stock} title={t('stock.title')} /> }}
        />
        <Stack.Screen name="PieceDetail" component={PieceDetailScreen} options={{ title: '' }} />
        <Stack.Screen
          name="AddPiece"
          component={AddPieceScreen}
          options={{ title: t('piece.addTitle'), headerTitle: () => <ScreenTitle icon={ROUTE_ICONS.AddPiece} title={t('piece.addTitle')} /> }}
        />
        <Stack.Screen
          name="StockIntake"
          component={StockIntakeScreen}
          options={{ title: t('stockIntake.title'), headerTitle: () => <ScreenTitle icon={ROUTE_ICONS.StockIntake} title={t('stockIntake.title')} /> }}
        />
        <Stack.Screen
          name="LogSale"
          component={LogSaleScreen}
          options={{ title: t('sale.title'), headerTitle: () => <ScreenTitle icon={ROUTE_ICONS.LogSale} title={t('sale.title')} /> }}
        />
        <Stack.Screen
          name="Purchases"
          component={PurchasesScreen}
          options={{ title: t('purchases.title'), headerTitle: () => <ScreenTitle icon={ROUTE_ICONS.Purchases} title={t('purchases.title')} /> }}
        />
        <Stack.Screen
          name="Balances"
          component={BalancesScreen}
          options={{ title: t('balances.title'), headerTitle: () => <ScreenTitle icon={ROUTE_ICONS.Balances} title={t('balances.title')} /> }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: t('settings.title'), headerTitle: () => <ScreenTitle icon={ROUTE_ICONS.Settings} title={t('settings.title')} /> }}
        />
        <Stack.Screen
          name="Insights"
          component={InsightsScreen}
          options={{ title: t('insights.title'), headerTitle: () => <ScreenTitle icon={ROUTE_ICONS.Insights} title={t('insights.title')} /> }}
        />
        <Stack.Screen
          name="CustomOrders"
          component={CustomOrdersScreen}
          options={{ title: t('customOrders.title'), headerTitle: () => <ScreenTitle icon={ROUTE_ICONS.CustomOrders} title={t('customOrders.title')} /> }}
        />
        <Stack.Screen
          name="Reservations"
          component={ReservationsScreen}
          options={{ title: t('reservations.title'), headerTitle: () => <ScreenTitle icon={ROUTE_ICONS.Reservations} title={t('reservations.title')} /> }}
        />
        <Stack.Screen
          name="Social"
          component={SocialScreen}
          options={{ title: t('social.title'), headerTitle: () => <ScreenTitle icon={ROUTE_ICONS.Social} title={t('social.title')} /> }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    titleText: { fontSize: 17, fontWeight: '700', color: colors.ink },
  });
