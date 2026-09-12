import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { HomeScreen } from '../screens/HomeScreen';
import { StockScreen } from '../screens/StockScreen';
import { PieceDetailScreen } from '../screens/PieceDetailScreen';
import { AddPieceScreen } from '../screens/AddPieceScreen';
import { StockIntakeScreen } from '../screens/StockIntakeScreen';
import { LogSaleScreen } from '../screens/LogSaleScreen';
import { PurchasesScreen } from '../screens/PurchasesScreen';
import { BalancesScreen } from '../screens/BalancesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { t } = useTranslation();
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: t('home.title') }} />
        <Stack.Screen name="Stock" component={StockScreen} options={{ title: t('stock.title') }} />
        <Stack.Screen name="PieceDetail" component={PieceDetailScreen} options={{ title: '' }} />
        <Stack.Screen
          name="AddPiece"
          component={AddPieceScreen}
          options={{ title: t('piece.addTitle') }}
        />
        <Stack.Screen
          name="StockIntake"
          component={StockIntakeScreen}
          options={{ title: t('stockIntake.title') }}
        />
        <Stack.Screen name="LogSale" component={LogSaleScreen} options={{ title: t('sale.title') }} />
        <Stack.Screen name="Purchases" component={PurchasesScreen} options={{ title: t('purchases.title') }} />
        <Stack.Screen name="Balances" component={BalancesScreen} options={{ title: t('balances.title') }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: t('settings.title') }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
